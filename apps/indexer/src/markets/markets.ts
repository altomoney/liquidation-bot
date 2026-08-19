import { ponder } from "ponder:registry";
import {
  irm,
  liquidationEngine,
  market,
  position,
} from "ponder:schema";

import { Address, keccak256, toHex, zeroAddress } from "viem";
import { AdaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrmAbi";
import { AltoBorrowMarketAbi } from "../../abis/AltoBorrowMarketAbi";
import { DlbDcfPriorityLiquidationEngineAbi } from "../../abis/DlbDcfPriorityLiquidationEngineAbi";
import { FixedRateIrmAbi } from "../../abis/FixedRateIrmAbi";
import { IAltoLiquidationEngineAbi } from "../../abis/IAltoLiquidationEngineAbi";
import { IrmAbi } from "../../abis/IrmAbi";
import { replaceBigInts } from "../utils";
import { FixedPointMath } from "@altomoney/sdk";
import {
  parseAdaptiveCurveIrmConfig,
  parseAdaptiveCurveIrmState,
  parseFixedRateIrmState,
  parseLiquidationConfiguration,
  irmTypeToString,
  liquidationEngineTypeToString,
  marketTypeToString,
} from "./abiParsers";

type MarketContext = Parameters<
  Parameters<typeof ponder.on<"MarketRegistry:BorrowMarketAdded">>[1]
>[0]["context"];

const pauseType = keccak256(toHex("PAUSE_TYPE"));

type MarketSnapshot = {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irmAddress: Address;
  liquidationEngineAddress: Address;
  marketType: ReturnType<typeof marketTypeToString>;
  ltv: bigint;
  feeRecipient: Address;
  totalSupply: readonly [bigint, bigint];
  totalBorrowed: readonly [bigint, bigint];
  interestFee: bigint;
  paused: boolean;
};

const readMarketSnapshot = async (
  address: Address,
  context: MarketContext
): Promise<MarketSnapshot> => {
  const marketTypeIndex = await context.client.readContract({
    abi: AltoBorrowMarketAbi,
    functionName: "MARKET_TYPE",
    address,
  });
  const resolvedMarketType = marketTypeToString(marketTypeIndex);

  const [
    loanToken,
    collateralToken,
    oracle,
    irmAddress,
    liquidationEngineAddress,
    ltv,
    feeRecipient,
    totalSupply,
    totalBorrowed,
    interestFee,
    paused,
  ] = await Promise.all([
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "borrowToken",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "collateralToken",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "oracle",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "irm",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "liquidationEngine",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "maxLtv",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "feeRecipient",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "totalSupply",
      address,
    }),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "totalBorrowed",
      address,
    }),
    resolvedMarketType === "borrow"
      ? context.client.readContract({
          abi: AltoBorrowMarketAbi,
          functionName: "interestFee",
          address,
        })
      : Promise.resolve(0n),
    context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "paused",
      args: [pauseType],
      address,
    }),
  ]);

  return {
    loanToken,
    collateralToken,
    oracle,
    irmAddress,
    liquidationEngineAddress,
    marketType: resolvedMarketType,
    ltv,
    feeRecipient,
    totalSupply,
    totalBorrowed,
    interestFee,
    paused,
  };
};

export const setupMarket: Parameters<
  typeof ponder.on<"MarketRegistry:BorrowMarketAdded">
>[1] = async ({ context, event }) => {
  const address = event.args.market;
  const snapshot = await readMarketSnapshot(address, context);

  await context.db
    .insert(market)
    .values({
      chainId: context.chain.id,
      address,
      type: snapshot.marketType,
      loanToken: snapshot.loanToken,
      collateralToken: snapshot.collateralToken,
      feeRecipient: snapshot.feeRecipient,
      oracle: snapshot.oracle,
      irm: snapshot.irmAddress === zeroAddress ? null : snapshot.irmAddress,
      ltv: snapshot.ltv,
      liquidationEngine: snapshot.liquidationEngineAddress,
      totalSupplyAssets: snapshot.totalSupply[0],
      totalSupplyShares: snapshot.totalSupply[1],
      totalBorrowAssets: snapshot.totalBorrowed[0],
      totalBorrowShares: snapshot.totalBorrowed[1],
      interestFee: snapshot.interestFee,
      paused: snapshot.paused,
    })
    .onConflictDoUpdate(() => ({
      isActive: true,
      type: snapshot.marketType,
      loanToken: snapshot.loanToken,
      collateralToken: snapshot.collateralToken,
      feeRecipient: snapshot.feeRecipient,
      oracle: snapshot.oracle,
      irm: snapshot.irmAddress === zeroAddress ? null : snapshot.irmAddress,
      ltv: snapshot.ltv,
      liquidationEngine: snapshot.liquidationEngineAddress,
      totalSupplyAssets: snapshot.totalSupply[0],
      totalSupplyShares: snapshot.totalSupply[1],
      totalBorrowAssets: snapshot.totalBorrowed[0],
      totalBorrowShares: snapshot.totalBorrowed[1],
      interestFee: snapshot.interestFee,
      paused: snapshot.paused,
    }));

  await updateNewIrm(snapshot.irmAddress, address, context);
  await updateNewLiquidationEngine(
    snapshot.liquidationEngineAddress,
    address,
    context
  );
};

export const deactivateMarket: Parameters<
  typeof ponder.on<"MarketRegistry:BorrowMarketRemoved">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.args.market,
    })
    .set((row) => ({ isActive: false }));
};

export const accrueInterest: Parameters<
  typeof ponder.on<"AltoBorrowMarket:AccrueInterest">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      totalSupplyAssets:
        row.type === "borrow"
          ? row.totalSupplyAssets + event.args.interest
          : row.totalSupplyAssets,
      totalBorrowAssets: row.totalBorrowAssets + event.args.interest,
    }));
};

export const addSupply: Parameters<
  typeof ponder.on<"AltoBorrowMarket:AddSupply">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Row must exist because `Supply` cannot preceed `CreateMarket`.
    context.db
      .update(market, { chainId: context.chain.id, address: event.log.address })
      .set((row) => ({
        totalSupplyAssets: row.totalSupplyAssets + event.args.assets,
        totalSupplyShares: row.totalSupplyShares + event.args.shares,
      })),
    // Row may or may not exist because `Supply` could be `user`'s first action.
    context.db
      .insert(position)
      .values({
        // primary key
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.onBehalf,
        // `Position` struct (unspecified fields default to 0n)
        supplyShares: event.args.shares,
      })
      .onConflictDoUpdate((row) => ({
        supplyShares: row.supplyShares + event.args.shares,
      })),
  ]);
};

export const removeSupply: Parameters<
  typeof ponder.on<"AltoBorrowMarket:RemoveSupply">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Row must exist because `Withdraw` cannot preceed `CreateMarket`.
    context.db
      .update(market, { chainId: context.chain.id, address: event.log.address })
      .set((row) => ({
        totalSupplyAssets: row.totalSupplyAssets - event.args.assets,
        totalSupplyShares: row.totalSupplyShares - event.args.shares,
      })),
    // Row must exist because `Withdraw` cannot preceed `Supply`.
    context.db
      .update(position, {
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.onBehalf,
      })
      .set((row) => ({ supplyShares: row.supplyShares - event.args.shares })),
  ]);
};

export const addCollateral: Parameters<
  typeof ponder.on<"AltoBorrowMarket:AddCollateral">
>[1] = async ({ context, event }) => {
  // Row may or may not exist because `SupplyCollateral` could be `user`'s first action.
  await context.db
    .insert(position)
    .values({
      // primary key
      chainId: context.chain.id,
      marketId: event.log.address,
      user: event.args.onBehalf,
      // `Position` struct (unspecified fields default to 0n)
      collateral: event.args.amount,
    })
    .onConflictDoUpdate((row) => ({
      collateral: row.collateral + event.args.amount,
    }));
};

export const removeCollateral: Parameters<
  typeof ponder.on<"AltoBorrowMarket:RemoveCollateral">
>[1] = async ({ context, event }) => {
  // Row must exist because `WithdrawCollateral` cannot preceed `SupplyCollateral`.
  await context.db
    .update(position, {
      chainId: context.chain.id,
      marketId: event.log.address,
      user: event.args.onBehalf,
    })
    .set((row) => ({ collateral: row.collateral - event.args.amount }));
};

export const borrow: Parameters<
  typeof ponder.on<"AltoBorrowMarket:Borrow">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Row must exist because `Borrow` cannot preceed `CreateMarket`.
    context.db
      .update(market, { chainId: context.chain.id, address: event.log.address })
      .set((row) => ({
        totalBorrowAssets:
          row.totalBorrowAssets + event.args.assets + event.args.feeAmount,
        totalBorrowShares: row.totalBorrowShares + event.args.shares,
        totalSupplyShares:
          row.type === "borrow"
            ? row.totalSupplyShares + event.args.feeSupplyShares
            : row.totalSupplyShares,
        totalSupplyAssets:
          row.type === "borrow"
            ? row.totalSupplyAssets + event.args.feeAmount
            : row.totalSupplyAssets,
      })),
    // Row must exist because `Borrow` cannot preceed `SupplyCollateral`.
    context.db
      .update(position, {
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.onBehalf,
      })
      .set((row) => ({ borrowShares: row.borrowShares + event.args.shares })),
    await context.db
      .insert(position)
      .values({
        // primary key
        chainId: context.chain.id,
        marketId: event.log.address,
        user: (await context.db.find(market, {
          address: event.log.address,
          chainId: context.chain.id,
        }))!.feeRecipient,
        // `Position` struct (unspecified fields default to 0n)
        supplyShares: event.args.feeSupplyShares,
      })
      .onConflictDoUpdate((row) => ({
        supplyShares: row.supplyShares + event.args.feeSupplyShares,
      })),
  ]);
};

export const repay: Parameters<
  typeof ponder.on<"AltoBorrowMarket:Repay">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Row must exist because `Repay` cannot preceed `CreateMarket`.
    context.db
      .update(market, { chainId: context.chain.id, address: event.log.address })
      .set((row) => ({
        totalBorrowAssets: row.totalBorrowAssets - event.args.assets,
        totalBorrowShares: row.totalBorrowShares - event.args.shares,
      })),
    // Row must exist because `Repay` cannot preceed `SupplyCollateral`.
    context.db
      .update(position, {
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.onBehalf,
      })
      .set((row) => ({ borrowShares: row.borrowShares - event.args.shares })),
  ]);
};

export const liquidation: Parameters<
  typeof ponder.on<"AltoBorrowMarket:Liquidation">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Row must exist because `Liquidate` cannot preceed `CreateMarket`.
    context.db
      .update(market, { chainId: context.chain.id, address: event.log.address })
      .set((row) => ({
        totalSupplyAssets:
          row.type === "borrow"
            ? row.totalSupplyAssets - event.args.badDebtClearedAssets
            : row.totalSupplyAssets,
        totalBorrowAssets: FixedPointMath.zeroFloorSub(
          row.totalBorrowAssets,
          event.args.repaidBorrow + event.args.badDebtClearedAssets
        ),
        totalBorrowShares:
          row.totalBorrowShares -
          event.args.repaidBorrowShares -
          event.args.badDebtClearedShares,
      })),
    // Row must exist because `Liquidate` cannot preceed `SupplyCollateral`.
    context.db
      .update(position, {
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.user,
      })
      .set((row) => ({
        collateral: row.collateral - event.args.liquidatedCollateral,
        borrowShares:
          row.borrowShares -
          event.args.repaidBorrowShares -
          event.args.badDebtClearedShares,
      })),
  ]);
};

export const setIrm: Parameters<
  typeof ponder.on<"AltoBorrowMarket:SetIrm">
>[1] = async ({ context, event }) => {
  await updateNewIrm(event.args.newAddr, event.log.address, context);
};

const updateNewIrm = async (
  irmAddress: Address,
  marketAddress: Address,
  context: MarketContext
): Promise<void> => {
  const marketDb = await context.db.find(market, {
    chainId: context.chain.id,
    address: marketAddress,
  });

  if (!marketDb) {
    return;
  }

  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: marketAddress,
    })
    .set({ irm: irmAddress === zeroAddress ? null : irmAddress });

  if (irmAddress === zeroAddress) {
    return;
  }

  const irmTypeIndex = await context.client.readContract({
    abi: IrmAbi,
    functionName: "IRM_TYPE",
    address: irmAddress,
  });

  const irmType = irmTypeToString(irmTypeIndex);

  if (irmType === "fixed") {
    const irmState = await context.client.readContract({
      abi: FixedRateIrmAbi,
      functionName: "irState",
      address: irmAddress,
    });

    await context.db
      .insert(irm)
      .values({
        chainId: context.chain.id,
        marketAddress: marketAddress,
        address: irmAddress,
        type: irmType,
        config: null,
        state: replaceBigInts(parseFixedRateIrmState(irmState)),
      })
      .onConflictDoUpdate((row) => ({
        marketAddress: marketAddress,
        state: replaceBigInts(parseFixedRateIrmState(irmState)),
      }));
    return;
  }

  if (irmType === "adaptive") {
    const [irmConfig, irmState] = await Promise.all([
      context.client.readContract({
        abi: AdaptiveCurveIrmAbi,
        functionName: "irmConfig",
        address: irmAddress,
      }),
      context.client.readContract({
        abi: AdaptiveCurveIrmAbi,
        functionName: "irState",
        address: irmAddress,
      }),
    ]);

    await context.db
      .insert(irm)
      .values({
        chainId: context.chain.id,
        marketAddress: marketAddress,
        address: irmAddress,
        type: irmType,
        config: replaceBigInts(parseAdaptiveCurveIrmConfig(irmConfig)),
        state: replaceBigInts(parseAdaptiveCurveIrmState(irmState)),
      })
      .onConflictDoUpdate((row) => ({
        marketAddress: marketAddress,
        state: replaceBigInts(parseAdaptiveCurveIrmState(irmState)),
        config: replaceBigInts(parseAdaptiveCurveIrmConfig(irmConfig)),
      }));
    return;
  }

  throw new Error(`Invalid IRM type: ${irmType}`);
};

export const setDebtCeiling: Parameters<
  typeof ponder.on<"AltoMintMarket:SetDebtCeiling">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({ totalSupplyAssets: event.args.newDebtCeiling }));
};

export const setLiquidationEngine: Parameters<
  typeof ponder.on<"AltoBorrowMarket:SetLiquidationEngine">
>[1] = async ({ context, event }) => {
  await updateNewLiquidationEngine(
    event.args.newLiquidationEngine,
    event.log.address,
    context
  );
};

const updateNewLiquidationEngine = async (
  liquidationEngineAddress: Address,
  marketAddress: Address,
  context: MarketContext
): Promise<void> => {
  const marketDb = await context.db.find(market, {
    chainId: context.chain.id,
    address: marketAddress,
  });

  if (!marketDb) {
    return;
  }

  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: marketAddress,
    })
    .set({ liquidationEngine: liquidationEngineAddress });

  if (liquidationEngineAddress === zeroAddress) {
    if (marketDb.liquidationEngine !== zeroAddress) {
      await context.db.delete(liquidationEngine, {
        chainId: context.chain.id,
        address: marketDb.liquidationEngine,
      });
    }
    return;
  }

  const liquidationEngineTypeIndex = await context.client.readContract({
    abi: IAltoLiquidationEngineAbi,
    functionName: "LIQUIDATION_ENGINE_TYPE",
    address: liquidationEngineAddress,
  });

  const liquidationEngineType = liquidationEngineTypeToString(
    liquidationEngineTypeIndex
  );

  if (liquidationEngineType === "DlbDcfPriorityLiquidationEngine") {
    const liquidationConfiguration = await context.client.readContract({
      abi: DlbDcfPriorityLiquidationEngineAbi,
      functionName: "liquidationConfiguration",
      address: liquidationEngineAddress,
    });

    if (
      marketDb.liquidationEngine !== zeroAddress &&
      marketDb.liquidationEngine !== liquidationEngineAddress
    ) {
      await context.db.delete(liquidationEngine, {
        chainId: context.chain.id,
        address: marketDb.liquidationEngine,
      });
    }

    await context.db
      .insert(liquidationEngine)
      .values({
        chainId: context.chain.id,
        marketAddress: marketAddress,
        address: liquidationEngineAddress,
        type: liquidationEngineType,
        config: replaceBigInts(
          parseLiquidationConfiguration(liquidationConfiguration)
        ),
      })
      .onConflictDoUpdate((row) => ({
        marketAddress: marketAddress,
        config: replaceBigInts(
          parseLiquidationConfiguration(liquidationConfiguration)
        ),
      }));
    return;
  }

  throw new Error(`Invalid Liquidation Engine type: ${liquidationEngineType}`);
};

export const governanceLiquidation: Parameters<
  typeof ponder.on<"AltoBorrowMarket:GovernanceLiquidation">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Row must exist because `GovernanceLiquidation` cannot preceed `CreateMarket`.
    context.db
      .update(market, { chainId: context.chain.id, address: event.log.address })
      .set((row) => ({
        totalSupplyAssets:
          row.type === "borrow"
            ? row.totalSupplyAssets - event.args.badDebtClearedAssets
            : row.totalSupplyAssets,
        totalBorrowAssets: FixedPointMath.zeroFloorSub(
          row.totalBorrowAssets,
          event.args.badDebtClearedAssets
        ),
        totalBorrowShares:
          row.totalBorrowShares - event.args.badDebtClearedShares,
      })),
    // Row must exist because `GovernanceLiquidation` cannot preceed `SupplyCollateral`.
    context.db
      .update(position, {
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.user,
      })
      .set((row) => ({
        collateral: 0n,
        borrowShares: 0n,
      })),
  ]);
};

export const pauseMarket: Parameters<
  typeof ponder.on<"AltoBorrowMarket:Paused">
>[1] = async ({ context, event }) => {
  if (event.args.pauseType !== pauseType) {
    return;
  }
  await Promise.all([
    // Row must exist because `GovernanceLiquidation` cannot preceed `CreateMarket`.
    context.db
      .update(market, {
        chainId: context.chain.id,
        address: event.log.address,
      })
      .set((row) => ({
        paused: event.args.paused,
      })),
  ]);
};

export const interestFeeAccrued: Parameters<
  typeof ponder.on<"AltoBorrowMarket:InterestFeeAccrued">
>[1] = async ({ context, event }) => {
  await Promise.all([
    // Update market totalSupplyShares with the fee shares
    context.db
      .update(market, {
        chainId: context.chain.id,
        address: event.log.address,
      })
      .set((row) => ({
        totalSupplyShares: row.totalSupplyShares + event.args.feeShares,
      })),
    // Upsert fee recipient's position with the fee shares
    context.db
      .insert(position)
      .values({
        chainId: context.chain.id,
        marketId: event.log.address,
        user: event.args.recipient,
        supplyShares: event.args.feeShares,
      })
      .onConflictDoUpdate((row) => ({
        supplyShares: row.supplyShares + event.args.feeShares,
      })),
  ]);
};

export const setInterestFee: Parameters<
  typeof ponder.on<"AltoBorrowMarket:SetInterestFee">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set(() => ({
      interestFee: event.args.newInterestFee,
    }));
};

export const setOracle: Parameters<
  typeof ponder.on<"AltoBorrowMarket:SetOracle">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set(() => ({
      oracle: event.args.newAddr,
    }));
};

export const setMaxLtv: Parameters<
  typeof ponder.on<"AltoBorrowMarket:SetMaxLtv">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set(() => ({
      ltv: event.args.newMaxLtv,
    }));
};

export const setFeeRecipient: Parameters<
  typeof ponder.on<"AltoBorrowMarket:SetFeeRecipient">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set(() => ({
      feeRecipient: event.args.newAddr,
    }));
};
