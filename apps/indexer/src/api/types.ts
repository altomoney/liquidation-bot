import { Hex } from "viem";
import { Equal, Expect } from "../utils";
import { IrmDb } from "../utils/irm/types";
import { LiquidationEngineDb } from "../utils/liquidation-engine/types";
import { MarketDb, PositionDb } from "../utils/market/types";

type StaticMarketDb = {
  irm: Hex | null;
  liquidationEngine: Hex;
  chainId: number;
  address: Hex;
  type: "mint" | "borrow" | "dao_mint";
  loanToken: Hex;
  collateralToken: Hex;
  feeRecipient: Hex;
  oracle: Hex;
  ltv: bigint;
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
};

type StaticPositionDb = {
  chainId: number;
  marketId: Hex;
  user: Hex;
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
};

type StaticIrmDb = {
  chainId: number;
  marketAddress: Hex;
  address: Hex;
  type: "fixed" | "adaptive";
  config: unknown;
  state: unknown;
};

type StaticLiquidationEngineDb = {
  chainId: number;
  address: Hex;
  marketAddress: Hex;
  type: "DlbDcfPriorityLiquidationEngine";
  config: unknown;
};

// Ensures that static typings match the database types
type _StaticMarketDbMatchesMarketDb = Expect<
  Equal<StaticMarketDb, Pick<MarketDb, keyof StaticMarketDb>>
>;

type _StaticPositionDbMatchesPositionDb = Expect<
  Equal<StaticPositionDb, Pick<PositionDb, keyof StaticPositionDb>>
>;

type _StaticIrmDbMatchesIrmDb = Expect<
  Equal<StaticIrmDb, Pick<IrmDb, keyof StaticIrmDb>>
>;

type _StaticLiquidationEngineDbMatchesLiquidationEngineDb = Expect<
  Equal<
    StaticLiquidationEngineDb,
    Pick<LiquidationEngineDb, keyof StaticLiquidationEngineDb>
  >
>;

export type ILiquidatablePosition = StaticPositionDb & {
  seizableCollateral: bigint;
};

export type IMarket = StaticMarketDb & {
  price: bigint;
  irmConfig: StaticIrmDb | null;
  liquidationEngineConfig: StaticLiquidationEngineDb;
};

export interface IndexerApiResponse {
  market: IMarket;
  positionsLiq: ILiquidatablePosition[];
}
