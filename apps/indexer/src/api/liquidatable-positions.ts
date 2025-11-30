import { and, eq, gt, inArray, ReadonlyDrizzle } from "ponder";
import { type Address, type Hex, PublicClient, zeroAddress } from "viem";

import { OracleAbi } from "../../abis/OracleAbi";
import * as schema from "../../ponder.schema";
import { replaceBigIntStringsToBigInts } from "../utils";
import {
  AdaptiveCurveIrm,
  AdaptiveCurveIrmConfig,
  AdaptiveCurveIrmState,
} from "../utils/irm/AdaptiveCurveIrm";
import { FixedRateIrm, FixedRateIrmState } from "../utils/irm/FixedRateIrm";
import { IIrm } from "../utils/irm/types";
import {
  DlbDcfPriorityLiquidationEngine,
  LiquidationConfiguration,
} from "../utils/liquidation-engine/DlbDcfPriorityLiquidationEngine";
import { ILiquidationEngine } from "../utils/liquidation-engine/types";
import { logToFile } from "../utils/log";
import { Market } from "../utils/market/Market";
import { ILiquidatablePosition, IMarket, IndexerApiResponse } from "./types";

export async function getLiquidatablePositions({
  db,
  chainId,
  publicClient,
  marketAddresses,
  isPriorityLiquidator,
  liquidatorAddress,
}: {
  db: ReadonlyDrizzle<typeof schema>;
  chainId: number;
  publicClient: PublicClient;
  marketAddresses: Hex[];
  isPriorityLiquidator: boolean;
  liquidatorAddress: Address;
}): Promise<{ results: IndexerApiResponse[]; warnings: string[] }> {
  const marketRows = await db.query.market.findMany({
    where: (row) =>
      and(eq(row.chainId, chainId), inArray(row.address, marketAddresses)),
    with: {
      // ! Note: following is omitted because it created imprecise results when fetching positions (couple of integer digits)
      // positions: { where: (row) => gt(row.borrowShares, 0n) },
      irm: true,
      liquidationEngine: true,
    },
  });

  const positions = await db.query.position.findMany({
    where: (row) =>
      and(
        gt(row.borrowShares, 0n),
        eq(row.chainId, chainId),
        inArray(row.marketId, marketAddresses)
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
  });
  const prices: Record<Address, (typeof pricesArr)[number]> = {};
  for (let i = 0; i < oracles.length; i += 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    prices[oracles[i]!] = pricesArr[i]!;
  }

  const now = BigInt((Date.now() / 1000).toFixed(0));

  const warnings: string[] = [];

  const getPrice = (oracle: Address) => {
    const price = prices[oracle];
    if (oracle === zeroAddress) {
      return;
    }
    if (price === undefined) {
      warnings.push(
        `${oracle} was skipped when fetching prices -- SHOULD NEVER HAPPEN.`
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
      (position) => position.marketId === dbMarket.address
    );

    const price = getPrice(dbMarket.oracle);
    if (price === undefined) continue;

    let irm: IIrm | undefined;

    if (dbMarket.irm) {
      if (dbMarket.irm.type === "fixed") {
        const state = replaceBigIntStringsToBigInts(
          dbMarket.irm.state as FixedRateIrmState
        );
        irm = new FixedRateIrm(state);
      } else if (dbMarket.irm.type === "adaptive") {
        const config = replaceBigIntStringsToBigInts(
          dbMarket.irm.config as AdaptiveCurveIrmConfig
        );
        const state = replaceBigIntStringsToBigInts(
          dbMarket.irm.state as AdaptiveCurveIrmState
        );
        irm = new AdaptiveCurveIrm(config, state);
      }
    }

    const market = new Market(dbMarket, price, irm).accrueInterest(now);

    let liquidationEngine: ILiquidationEngine | undefined;
    if (dbMarket.liquidationEngine.type === "DlbDcfPriorityLiquidationEngine") {
      const state = replaceBigIntStringsToBigInts(
        dbMarket.liquidationEngine.config as LiquidationConfiguration
      );
      logToFile("state: " + JSON.stringify(dbMarket.liquidationEngine.config));
      liquidationEngine = new DlbDcfPriorityLiquidationEngine(
        market,
        state,
        isPriorityLiquidator
      );
    } else {
      throw new Error(
        `Invalid Liquidation Engine type: ${dbMarket.liquidationEngine.type}`
      );
    }

    const positionsLiq: ILiquidatablePosition[] = dbPositions
      .map((dbPosition) => {
        return {
          ...dbPosition,
          seizableCollateral:
            liquidationEngine.seizableCollateralOfPosition(
              dbPosition,
              liquidatorAddress,
              undefined
            ) ?? 0n,
        };
      })
      .filter((position) => position.seizableCollateral > 0n);

    // Sort
    positionsLiq.sort((a, b) =>
      a.seizableCollateral > b.seizableCollateral ? -1 : 1
    );

    if (positionsLiq.length > 0) {
      results.push({
        market: {
          ...dbMarket,
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
