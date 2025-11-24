import { Hex } from "viem";
import { Equal, Expect } from "../utils";
import { IrmDb } from "../utils/irm/types";
import { MarketDb, PositionDb } from "../utils/market/types";

type StaticMarketDb = {
  irm: Hex | null;
  chainId: number;
  address: Hex;
  type: "mint" | "borrow" | "dao_mint";
  loanToken: Hex;
  collateralToken: Hex;
  feeRecipient: Hex;
  oracle: Hex;
  ltv: bigint;
  lltv: bigint;
  tLltv: bigint;
  dynamicBonusFeeDecaySteepness: bigint;
  dynamicBonusFeeStart: bigint;
  liquidationBaseFee: bigint;
  minPenaltyPercentage: bigint;
  protocolFeePercentage: bigint;
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

export type ILiquidatablePosition = StaticPositionDb & {
  seizableCollateral: bigint;
};

export type IMarket = StaticMarketDb & {
  price: bigint;
  irmConfig: StaticIrmDb | null;
};

export interface IndexerApiResponse {
  market: IMarket;
  positionsLiq: ILiquidatablePosition[];
}
