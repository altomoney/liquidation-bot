import { FixedPointMath } from "../math/FixedPointMath";

export const _calculateCompoundInterest = (x: bigint, n: bigint): bigint => {
  const linearTerm = x * n;
  const quadraticTerm =
    (linearTerm * linearTerm) / (2n * FixedPointMath.MATH_PRECISION);
  const cubicTerm =
    (quadraticTerm * linearTerm) / (3n * FixedPointMath.MATH_PRECISION);

  let result = linearTerm + quadraticTerm + cubicTerm;

  if (linearTerm > BigInt(2e17)) {
    const quarticTerm =
      (cubicTerm * linearTerm) / (4n * FixedPointMath.MATH_PRECISION);

    if (result <= FixedPointMath.MAX_UINT_256 - quarticTerm) {
      result += quarticTerm;
    }
  }

  const maxSafeResult = 10n ** 20n;
  if (result > maxSafeResult) {
    result = maxSafeResult;
  }

  return result;
};
