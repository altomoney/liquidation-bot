import { and, eq, gt, inArray, ReadonlyDrizzle } from "ponder";
import { type Address, PublicClient, zeroAddress } from "viem";

import { OracleAbi } from "../../abis/OracleAbi";
import * as schema from "../../ponder.schema";
import { ENV } from "../utils/env";
import {
  toSdkIrm,
  toSdkLiquidationEngine,
  toSdkLiquidationPosition,
  toSdkMarket,
} from "../utils/sdkAdapters";
import { ILiquidatablePosition, IMarket, IndexerApiResponse } from "./types";

export async function getLiquidatablePositions({
  db,
  chainId,
  publicClient,
  isPriorityLiquidator,
  liquidatorAddress,
}: {
  db: ReadonlyDrizzle<typeof schema>;
  chainId: number;
  publicClient: PublicClient;
  isPriorityLiquidator: boolean;
  liquidatorAddress: Address;
}): Promise<{ results: IndexerApiResponse[]; warnings: string[] }> {
  const marketRows = await db.query.market.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.isActive, true),
        eq(row.paused, false),
      ),
    with: {
      // ! Note: following is omitted because it created imprecise results when fetching positions (couple of integer digits)
      // positions: { where: (row) => gt(row.borrowShares, 0n) },
      irm: true,
      liquidationEngine: true,
    },
  });

  const marketAddresses = marketRows.map((market) => market.address);

  const positions = await db.query.position.findMany({
    where: (row) =>
      and(
        gt(row.borrowShares, 0n),
        eq(row.chainId, chainId),
        inArray(row.marketId, marketAddresses),
      ),
  });

  const oracleSet = new Set([...marketRows.map((market) => market.oracle)]);

  oracleSet.delete(zeroAddress);
  const oracles = [...oracleSet];

  // Fetch prices from each unique oracle
  const pricesArr = await publicClient.multicall({
    contracts: oracles.map((oracle) => ({
      abi: OracleAbi,
      address: oracle,
      functionName: "getPrice",
    })),
    allowFailure: true,
    batchSize: 2 ** 16,
    blockNumber: ENV.DEV_END_BLOCK ? BigInt(ENV.DEV_END_BLOCK) : undefined,
  });
  const prices: Record<Address, (typeof pricesArr)[number]> = {};
  for (let i = 0; i < oracles.length; i += 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    prices[oracles[i]!] = pricesArr[i]!;
  }

  const now =
    ENV.DEV_EVALUATION_TIMESTAMP ?? BigInt((Date.now() / 1000).toFixed(0));

  const warnings: string[] = [];

  const getPrice = (oracle: Address) => {
    const price = prices[oracle];
    if (oracle === zeroAddress) {
      return;
    }
    if (price === undefined) {
      warnings.push(
        `${oracle} was skipped when fetching prices -- SHOULD NEVER HAPPEN.`,
      );
      return;
    }
    if (price.status === "failure") {
      warnings.push(`${oracle} failed to return a price ${price.error}`);
      return;
    }
    return price.result;
  };

  const results: {
    market: IMarket;
    positionsLiq: ILiquidatablePosition[];
  }[] = [];

  for (const dbMarket of marketRows) {
    const dbPositions = positions.filter(
      (position) => position.marketId === dbMarket.address,
    );

    const price = getPrice(dbMarket.oracle);
    if (price === undefined) continue;

    const irm = toSdkIrm(dbMarket.irm);
    const market = toSdkMarket({
      dbMarket,
      price,
      irm,
    }).accrueInterest(now);
    const liquidationEngine = toSdkLiquidationEngine({
      market,
      dbLiquidationEngine: dbMarket.liquidationEngine,
      isPriorityLiquidator,
    });

    const positionsLiq: ILiquidatablePosition[] = dbPositions
      .map((dbPosition) => {
        return {
          ...dbPosition,
          seizableCollateral:
            liquidationEngine.seizableCollateralOfPosition(
              toSdkLiquidationPosition(dbPosition),
              liquidatorAddress,
              undefined,
            ) ?? 0n,
        };
      })
      .filter((position) => position.seizableCollateral > 0n);

    // Sort
    positionsLiq.sort((a, b) =>
      a.seizableCollateral > b.seizableCollateral ? -1 : 1,
    );

    if (positionsLiq.length > 0) {
      results.push({
        market: {
          ...dbMarket,
          totalSupplyAssets: market.totalSupplyAssets,
          totalSupplyShares: market.totalSupplyShares,
          totalBorrowAssets: market.totalBorrowAssets,
          totalBorrowShares: market.totalBorrowShares,
          price,
          irmConfig: dbMarket.irm,
          liquidationEngineConfig: dbMarket.liquidationEngine,
        },
        positionsLiq,
      });
    }
  }

  return { warnings, results };
}
