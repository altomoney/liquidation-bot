import { FixedPointMath } from "./FixedPointMath";

const VIRTUAL_SHARES = 10n ** 6n;
const VIRTUAL_ASSETS = 1n;

export namespace AssetShareConversionMath {
  export function convertToSharesDown(
    assets: bigint,
    totalAssets: bigint,
    totalShares: bigint
  ) {
    return FixedPointMath.divideWithRounding(
      assets,
      totalShares + VIRTUAL_SHARES,
      totalAssets + VIRTUAL_ASSETS,
      "Down"
    );
  }

  /// @dev Calculates the value of `shares` quoted in assets, rounding down.
  export function convertToAssetsDown(
    shares: bigint,
    totalAssets: bigint,
    totalShares: bigint
  ) {
    return FixedPointMath.divideWithRounding(
      shares,
      totalAssets + VIRTUAL_ASSETS,
      totalShares + VIRTUAL_SHARES,
      "Down"
    );
  }

  /// @dev Calculates the value of `assets` quoted in shares, rounding up.
  export function convertToSharesUp(
    assets: bigint,
    totalAssets: bigint,
    totalShares: bigint
  ) {
    return FixedPointMath.divideWithRoundingUp(
      assets,
      totalShares + VIRTUAL_SHARES,
      totalAssets + VIRTUAL_ASSETS
    );
  }

  /// @dev Calculates the value of `shares` quoted in assets, rounding up.
  export function convertToAssetsUp(
    shares: bigint,
    totalAssets: bigint,
    totalShares: bigint
  ) {
    return FixedPointMath.divideWithRoundingUp(
      shares,
      totalAssets + VIRTUAL_ASSETS,
      totalShares + VIRTUAL_SHARES
    );
  }
}
