import { ponder } from "ponder:registry";
import { irm, liquidationEngine, market, position } from "ponder:schema";

import { Address, keccak256, toHex, zeroAddress } from "viem";
import { AdaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrmAbi";
import { AltoBorrowMarketAbi } from "../../abis/AltoBorrowMarketAbi";
import { DlbDcfPriorityLiquidationEngineAbi } from "../../abis/DlbDcfPriorityLiquidationEngineAbi";
import { FixedRateIrmAbi } from "../../abis/FixedRateIrmAbi";
import { IAltoLiquidationEngineAbi } from "../../abis/IAltoLiquidationEngineAbi";
import { IrmAbi } from "../../abis/IrmAbi";
import { replaceBigInts } from "../utils";
import { AdaptiveCurveIrm } from "../utils/irm/AdaptiveCurveIrm";
import { FixedRateIrm } from "../utils/irm/FixedRateIrm";
import { DlbDcfPriorityLiquidationEngine } from "../utils/liquidation-engine/DlbDcfPriorityLiquidationEngine";
import { FixedPointMath } from "../utils/math/FixedPointMath";
import {
  irmTypeToString,
  liquidationEngineTypeToString,
  marketTypeToString,
} from "./utils";

export const setupMarket: (
  type: "AltoBorrowMarket" | "AltoMintMarket"
) => Parameters<typeof ponder.on<"MarketRegistry:BorrowMarketAdded">>[1] =
  (type) =>
  async ({ context, event }) => {
    const address = event.args.market;

    const loanToken = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "borrowToken",
      address: address,
    });
    const collateralToken = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "collateralToken",
      address: address,
    });
    const oracle = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "oracle",
      address: address,
    });
    const irm = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "irm",
      address: address,
    });

    const liquidationEngine = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "liquidationEngine",
      address: address,
    });

    const marketType = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "MARKET_TYPE",
      address: address,
    });

    const ltv = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "maxLtv",
      address: address,
    });

    const feeRecipient = await context.client.readContract({
      abi: AltoBorrowMarketAbi,
      functionName: "feeRecipient",
      address: address,
    });

    // For mint markets, read the initial totalSupply (debt ceiling) since
    // SetDebtCeiling is emitted before the market is registered
    const [totalSupplyAssets, totalSupplyShares] =
      type === "AltoMintMarket"
        ? await context.client.readContract({
            abi: AltoBorrowMarketAbi,
            functionName: "totalSupply",
            address: address,
          })
        : [0n, 0n];

    // For borrow markets, read the interest fee percentage
    const interestFee =
      type === "AltoBorrowMarket"
        ? await context.client.readContract({
            abi: AltoBorrowMarketAbi,
            functionName: "interestFee",
            address: address,
          })
        : 0n;

    await context.db.insert(market).values({
      // primary key
      chainId: context.chain.id,
      address: address,
      type: marketTypeToString(marketType),
      loanToken: loanToken,
      collateralToken: collateralToken,
      feeRecipient: feeRecipient,
      oracle: oracle,
      irm: irm,
      ltv: ltv,
      liquidationEngine: liquidationEngine,
      totalSupplyAssets: totalSupplyAssets,
      totalSupplyShares: totalSupplyShares,
      interestFee: interestFee,
    });

    await updateNewIrm(irm, address, context);

    await updateNewLiquidationEngine(liquidationEngine, address, context);
  };

export const deactivateMarket: Parameters<
  typeof ponder.on<"MarketRegistry:BorrowMarketRemoved">
>[1] = async ({ context, event }) => {
  await context.db
    .update(market, {
      chainId: context.chain.id,
      address: event.log.address,
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
  context: Parameters<
    Parameters<typeof ponder.on<"AltoBorrowMarket:setup">>[1]
  >[0]["context"]
) => {
  const marketDb = await context.db.find(market, {
    chainId: context.chain.id,
    address: marketAddress,
  });

  if (!marketDb) {
    return;
  }

  if (irmAddress === zeroAddress) {
    await context.db
      .update(market, {
        chainId: context.chain.id,
        address: marketAddress,
      })
      .set((row) => ({
        irm: null,
      }));

    await context.db.delete(irm, {
      chainId: context.chain.id,
      address: irmAddress,
    });

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
      .update(market, {
        chainId: context.chain.id,
        address: marketAddress,
      })
      .set((row) => ({
        irm: irmAddress,
      }));
    await context.db
      .insert(irm)
      .values({
        chainId: context.chain.id,
        marketAddress: marketAddress,
        address: irmAddress,
        type: irmType,
        config: null,
        state: replaceBigInts(FixedRateIrm.stateFromRawState(irmState)),
      })
      .onConflictDoUpdate((row) => ({
        marketAddress: marketAddress,
        state: replaceBigInts(FixedRateIrm.stateFromRawState(irmState)),
      }));
    return;
  }

  if (irmType === "adaptive") {
    const irmConfig = await context.client.readContract({
      abi: AdaptiveCurveIrmAbi,
      functionName: "irmConfig",
      address: irmAddress,
    });
    const irmState = await context.client.readContract({
      abi: AdaptiveCurveIrmAbi,
      functionName: "irState",
      address: irmAddress,
    });
    await context.db
      .update(market, {
        chainId: context.chain.id,
        address: marketAddress,
      })
      .set((row) => ({
        irm: irmAddress,
      }));
    await context.db
      .insert(irm)
      .values({
        chainId: context.chain.id,
        marketAddress: marketAddress,
        address: irmAddress,
        type: irmType,
        config: replaceBigInts(AdaptiveCurveIrm.configFromRawConfig(irmConfig)),
        state: replaceBigInts(AdaptiveCurveIrm.stateFromRawState(irmState)),
      })
      .onConflictDoUpdate((row) => ({
        marketAddress: marketAddress,
        state: replaceBigInts(AdaptiveCurveIrm.stateFromRawState(irmState)),
        config: replaceBigInts(AdaptiveCurveIrm.configFromRawConfig(irmConfig)),
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
  context: Parameters<
    Parameters<typeof ponder.on<"AltoBorrowMarket:setup">>[1]
  >[0]["context"]
) => {
  const marketDb = await context.db.find(market, {
    chainId: context.chain.id,
    address: marketAddress,
  });

  if (marketDb) {
    // delete previous liquidation engine
    await context.db.delete(liquidationEngine, {
      chainId: context.chain.id,
      address: marketDb.liquidationEngine,
    });

    // set new liquidation engine
    await context.db
      .update(market, {
        chainId: context.chain.id,
        address: marketAddress,
      })
      .set((row) => ({
        liquidationEngine: liquidationEngineAddress,
      }));
  } else {
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

    await context.db
      .update(market, {
        chainId: context.chain.id,
        address: marketAddress,
      })
      .set((row) => ({
        liquidationEngine: liquidationEngineAddress,
      }));
    await context.db
      .insert(liquidationEngine)
      .values({
        chainId: context.chain.id,
        marketAddress: marketAddress,
        address: liquidationEngineAddress,
        type: liquidationEngineType,
        config: replaceBigInts(
          DlbDcfPriorityLiquidationEngine.configFromRawConfig(
            liquidationConfiguration
          )
        ),
      })
      .onConflictDoUpdate((row) => ({
        marketAddress: marketAddress,
        config: replaceBigInts(
          DlbDcfPriorityLiquidationEngine.configFromRawConfig(
            liquidationConfiguration
          )
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
  // bytes32 constant PAUSE_TYPE = keccak256("PAUSE_TYPE");
  const pauseType = keccak256(toHex("PAUSE_TYPE"));
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
