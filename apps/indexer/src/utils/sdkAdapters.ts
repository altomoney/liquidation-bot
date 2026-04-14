import {
  AdaptiveCurveIrm,
  DlbDcfPriorityLiquidationEngine,
  FixedRateIrm,
  Market,
  MarketType,
  type LiquidationConfiguration,
} from "@altomoney/sdk";

import type { IrmDb, LiquidationEngineDb, MarketDb, PositionDb } from "./dbTypes";
import { replaceBigIntStringsToBigInts } from "./index";

type SupportedSdkIrm = AdaptiveCurveIrm | FixedRateIrm;

function toSdkMarketType(type: MarketDb["type"]) {
  return type === "borrow" ? MarketType.Borrow : MarketType.Mint;
}

export function toSdkIrm(dbIrm: IrmDb | null | undefined): SupportedSdkIrm | undefined {
  if (!dbIrm) {
    return undefined;
  }

  if (dbIrm.type === "fixed") {
    return new FixedRateIrm(
      replaceBigIntStringsToBigInts(dbIrm.state as FixedRateIrm["state"]),
    );
  }

  return new AdaptiveCurveIrm(
    replaceBigIntStringsToBigInts(dbIrm.config as AdaptiveCurveIrm["config"]),
    replaceBigIntStringsToBigInts(dbIrm.state as AdaptiveCurveIrm["state"]),
  );
}

export function toSdkMarket(params: {
  dbMarket: MarketDb;
  price: bigint;
  irm?: SupportedSdkIrm;
}) {
  const { dbMarket, price, irm } = params;

  return new Market({
    params: {
      address: dbMarket.address,
      marketType: toSdkMarketType(dbMarket.type),
      borrowToken: dbMarket.loanToken,
      collateralToken: dbMarket.collateralToken,
      oracle: dbMarket.oracle,
      irm: dbMarket.irm ?? dbMarket.address,
      liquidationEngine: dbMarket.liquidationEngine,
      maxLtv: dbMarket.ltv,
      feeRecipient: dbMarket.feeRecipient,
      borrowOpeningFee: 0n,
    },
    totalSupplyAssets: dbMarket.totalSupplyAssets,
    totalSupplyShares: dbMarket.totalSupplyShares,
    totalBorrowAssets: dbMarket.totalBorrowAssets,
    totalBorrowShares: dbMarket.totalBorrowShares,
    lastUpdate:
      irm instanceof FixedRateIrm || irm instanceof AdaptiveCurveIrm
        ? irm.state.lastUpdate
        : 0n,
    collateralPrice: price,
    interestRateModel: irm,
    interestFee: dbMarket.interestFee,
    isPaused: dbMarket.paused,
  });
}

export function toSdkLiquidationEngine(params: {
  market: Market;
  dbLiquidationEngine: LiquidationEngineDb;
  isPriorityLiquidator: boolean;
}) {
  const { market, dbLiquidationEngine, isPriorityLiquidator } = params;

  return new DlbDcfPriorityLiquidationEngine(
    market,
    replaceBigIntStringsToBigInts(
      dbLiquidationEngine.config as LiquidationConfiguration,
    ),
    isPriorityLiquidator,
  );
}

export function toSdkLiquidationPosition(position: PositionDb) {
  return {
    borrowShares: position.borrowShares,
    collateralAssets: position.collateral,
  };
}
