import type { Address } from "viem";
import { mainnet } from "viem/chains";

/**
 * Common intermediary tokens for multi-hop swaps.
 * When a direct conversion fails, the bot will try routing through these tokens.
 * Order matters: tokens earlier in the list are tried first.
 */
export const INTERMEDIARY_TOKENS: Record<number, Address[]> = {
  [mainnet.id]: [
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
  ],
};

