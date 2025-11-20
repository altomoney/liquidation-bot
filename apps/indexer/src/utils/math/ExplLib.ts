import { FixedPointMath } from "./FixedPointMath";

// Constants copied from Solidity, scaled by 1e18
export const LN_2_INT = 693147180559945309n; // 0.693147180559945309 ether
export const LN_WEI_INT = -41446531673892822312n; // -41.446531673892822312 ether
export const WEXP_UPPER_BOUND = 93859467695000404319n; // 93.859467695000404319 ether

// 57716089161558943949701069502944508345128.422502756744429568 ether
export const WEXP_UPPER_VALUE =
  57716089161558943949701069502944508345128422502756744429568n;

/**
 * Approximate exp(x) with x in 1e18 fixed-point, returning 1e18 fixed-point.
 * Mirrors `ExpLib.wExp(int256 x)` from Solidity.
 */
export function wExp(x: bigint): bigint {
  // If x < ln(1e-18) then exp(x) < 1e-18 so it is rounded to zero.
  if (x < LN_WEI_INT) return 0n;

  // Clip to avoid overflowing when multiplied with 1 ether.
  if (x >= WEXP_UPPER_BOUND) return WEXP_UPPER_VALUE;

  // Decompose x as x = q * ln(2) + r with q integer and -ln(2)/2 <= r <= ln(2)/2.
  const halfLn2 = LN_2_INT / 2n;
  const roundingAdjustment = x < 0n ? -halfLn2 : halfLn2;

  // q = x / ln(2) rounded half toward zero.
  const q = (x + roundingAdjustment) / LN_2_INT;

  // r = x - q * ln(2)
  const r = x - q * LN_2_INT;

  // e^r via 2nd-order Taylor: 1 + r + r^2/2 (all in 1e18 fixed-point)
  const expR =
    FixedPointMath.MATH_PRECISION +
    r +
    (r * r) / FixedPointMath.MATH_PRECISION / 2n;

  // e^x = 2^q * e^r
  if (q >= 0n) {
    return expR << q; // multiply by 2^q
  } else {
    return expR >> -q; // divide by 2^(-q)
  }
}
