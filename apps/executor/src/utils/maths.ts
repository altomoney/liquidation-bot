export const WAD = 10n ** 18n;
export const ORACLE_PRICE_PRECISION = 10n ** 36n;
export const DEFAULT_LIQUIDATION_BUFFER_BPS = 10;

export function wMulDown(x: bigint, y: bigint) {
  return (x * y) / 10n ** 18n;
}

/**
 * Calculate the current LTV of a position
 * @param collateral - collateral amount in base units
 * @param borrowShares - borrow shares of the position
 * @param totalBorrowAssets - total borrow assets of the market
 * @param totalBorrowShares - total borrow shares of the market
 * @param oraclePrice - oracle price (36 decimals precision)
 * @returns LTV as a percentage (e.g., 80.5 for 80.5%)
 */
export function calculatePositionLtv(
  collateral: bigint,
  borrowShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  oraclePrice: bigint
): number {
  if (collateral === 0n || oraclePrice === 0n) return 0;

  // collateralValue = collateral * oraclePrice / ORACLE_PRECISION
  const collateralValue = (collateral * oraclePrice) / ORACLE_PRICE_PRECISION;
  if (collateralValue === 0n) return 0;

  // borrowAssets = borrowShares * totalBorrowAssets / totalBorrowShares
  const borrowAssets =
    totalBorrowShares > 0n
      ? (borrowShares * totalBorrowAssets) / totalBorrowShares
      : 0n;

  // LTV = borrowAssets / collateralValue * 100
  const ltvBps = (borrowAssets * 10000n) / collateralValue;
  return Number(ltvBps) / 100;
}

/**
 * Format oracle price to human-readable format
 * Assumes collateral has 8 decimals (like cbBTC) and loan has 18 decimals (like DUSD)
 * @param oraclePrice - oracle price (36 decimals precision)
 * @param collateralDecimals - decimals of collateral token (default: 8 for cbBTC)
 * @param loanDecimals - decimals of loan token (default: 18 for DUSD)
 * @returns formatted price string (e.g., "$86,091.23")
 */
export function formatOraclePrice(
  oraclePrice: bigint,
  collateralDecimals = 8,
  loanDecimals = 18
): string {
  // For 1 full unit of collateral: value = 10^collateralDecimals * price / 10^36
  // In loan token terms: value / 10^loanDecimals
  const oneUnit = 10n ** BigInt(collateralDecimals);
  const valueInLoanBaseUnits = (oneUnit * oraclePrice) / ORACLE_PRICE_PRECISION;
  const price = Number(valueInLoanBaseUnits) / 10 ** loanDecimals;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
