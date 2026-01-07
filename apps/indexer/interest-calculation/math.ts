import { AssetShareConversionMath } from "../src/utils/math/AssetShareConversionMath";
import { MarketState, PositionState } from "./types";

/**
 * Convert supply shares to assets using the market state.
 */
export function convertSupplySharesToAssets(
  shares: bigint,
  marketState: MarketState
): bigint {
  if (shares === 0n) return 0n;

  return AssetShareConversionMath.convertToAssetsDown(
    shares,
    marketState.totalSupplyAssets,
    marketState.totalSupplyShares
  );
}

/**
 * Convert borrow shares to assets using the market state.
 */
export function convertBorrowSharesToAssets(
  shares: bigint,
  marketState: MarketState
): bigint {
  if (shares === 0n) return 0n;

  return AssetShareConversionMath.convertToAssetsDown(
    shares,
    marketState.totalBorrowAssets,
    marketState.totalBorrowShares
  );
}

/**
 * Calculate the asset value of a position at a given market state.
 */
export function calculatePositionAssets(
  position: PositionState,
  marketState: MarketState
): { supplyAssets: bigint; borrowAssets: bigint } {
  return {
    supplyAssets: convertSupplySharesToAssets(
      position.supplyShares,
      marketState
    ),
    borrowAssets: convertBorrowSharesToAssets(
      position.borrowShares,
      marketState
    ),
  };
}
