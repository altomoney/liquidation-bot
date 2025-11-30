/**
 * Configuration for USM (Unified Stablecoin Module) venues
 *
 * The USM venue will:
 * 1. Swap collateral to the USM's underlying asset via Uniswap
 * 2. Call sellAsset on the USM to convert underlying to stable token
 *
 * Use `uniswapSmartOrderRouter.ts` config for the uniswap venue.
 * Adjust `config.ts` with desired USM addresses.
 */
