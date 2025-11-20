export type RoundingDirection = "Up" | "Down";

export namespace FixedPointMath {
  export const MATH_PRECISION = 1_000000000000000000n;

  export const MAX_UINT_256 = maxUint(256);
  export const MAX_UINT_160 = maxUint(160);
  export const MAX_UINT_128 = maxUint(128);
  export const MAX_UINT_48 = maxUint(48);

  export function maxUint(nBits: number) {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);

    return BigInt(`0x${"f".repeat(nBits / 4)}`);
  }

  /**
   * Returns the absolute value of a number
   * @param a The number
   */
  export function abs(a: bigint) {
    a = BigInt(a);

    return a >= 0 ? a : -a;
  }

  /**
   * Returns the smallest number given as param
   * @param x The first number
   * @param y The second number
   */
  export function min(...xs: bigint[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
  }

  /**
   * Returns the greatest number given as param
   * @param x The first number
   * @param y The second number
   */
  export function max(...xs: bigint[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
  }

  /**
   * Returns the subtraction of b from a, floored to zero if negative
   * @param x The first number
   * @param y The second number
   */
  export function zeroFloorSub(x: bigint, y: bigint) {
    x = BigInt(x);
    y = BigInt(y);

    return x <= y ? 0n : x - y;
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   */
  export function multiplyWithPrecision(x: bigint, y: bigint) {
    return FixedPointMath.multiplyWithPrecisionWithRounding(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   */
  export function multiplyWithPrecisionUp(x: bigint, y: bigint) {
    return FixedPointMath.multiplyWithPrecisionWithRounding(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
   */
  export function multiplyWithPrecisionWithRounding(
    x: bigint,
    y: bigint,
    rounding: RoundingDirection
  ) {
    return FixedPointMath.divideWithRounding(
      x,
      y,
      FixedPointMath.MATH_PRECISION,
      rounding
    );
  }

  /**
   * Perform the WAD-based division of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   */
  export function divideWithPrecisionDown(x: bigint, y: bigint) {
    return FixedPointMath.divideWithPrecisionWithRounding(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   */
  export function divideWithPrecisionUp(x: bigint, y: bigint) {
    return FixedPointMath.divideWithPrecisionWithRounding(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
   */
  export function divideWithPrecisionWithRounding(
    x: bigint,
    y: bigint,
    rounding: RoundingDirection
  ) {
    return FixedPointMath.divideWithRounding(
      x,
      FixedPointMath.MATH_PRECISION,
      y,
      rounding
    );
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding down the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   */
  export function divideWithRoundingDown(
    x: bigint,
    y: bigint,
    denominator: bigint
  ) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("DIVISION_BY_ZERO");

    return (x * y) / denominator;
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding up the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   */
  export function divideWithRoundingUp(
    x: bigint,
    y: bigint,
    denominator: bigint
  ) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("DIVISION_BY_ZERO");

    const roundup = (x * y) % denominator > 0 ? 1n : 0n;

    return (x * y) / denominator + roundup;
  }

  export function divideWithRounding(
    x: bigint,
    y: bigint,
    denominator: bigint,
    rounding: RoundingDirection
  ) {
    return FixedPointMath[`divideWithRounding${rounding}`](x, y, denominator);
  }
}
