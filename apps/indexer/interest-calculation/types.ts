import { Hex } from "viem";

export type MarketType = "mint" | "borrow" | "dao_mint";

export interface MarketInfo {
  chainId: number;
  address: Hex;
  type: MarketType;
  loanToken: Hex;
  collateralToken: Hex;
}

export interface MarketState {
  chainId: number;
  address: Hex;
  blockNumber: bigint;
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
}

export interface PositionState {
  chainId: number;
  marketId: Hex;
  user: Hex;
  blockNumber: bigint;
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

export interface UserInterest {
  user: Hex;
  // Supply position
  supplySharesAtStart: bigint;
  supplySharesAtEnd: bigint;
  supplyAssetsAtStart: bigint;
  supplyAssetsAtEnd: bigint;
  // Supply interest breakdown:
  // - supplyInterestEarned: interest from rate appreciation (always >= 0)
  // - supplyBadDebtLoss: loss from bad debt events (always >= 0, represents loss)
  // - supplyNetChange: net change = earned - loss (can be negative if bad debt > interest)
  supplyInterestEarned: bigint; // Pure interest earned (>= 0)
  supplyBadDebtLoss: bigint; // Bad debt loss absorbed (>= 0)
  supplyNetChange: bigint; // Net result (can be < 0)
  // Borrow position
  borrowSharesAtStart: bigint;
  borrowSharesAtEnd: bigint;
  borrowAssetsAtStart: bigint;
  borrowAssetsAtEnd: bigint;
  borrowInterestOwed: bigint; // Interest owed on borrows (>= 0)
  // Net interest (positive = earned, negative = owed)
  netInterest: bigint;
}

export interface InterestCalculationResult {
  chainId: number;
  marketAddress: Hex;
  marketType: MarketType;
  startBlock: bigint;
  endBlock: bigint;
  marketStateAtStart: MarketState;
  marketStateAtEnd: MarketState;
  userInterests: UserInterest[];
}

export interface Config {
  chainId: number;
  marketAddress: Hex;
  startBlock: bigint;
  endBlock: bigint;
  indexerApiUrl: string;
}
