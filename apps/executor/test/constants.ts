import type { Address } from "viem";

export const ORACLE_PRICE_PRECISION = 10n ** 36n;

export const PONDER_BASE_URL = "http://localhost:42069";

export const ADDRESSES = {
  1: {
    usmRegistry: "0xAD5620e10C33918E2C6A2E8E53325bf98c548E5e",
  },
} as Record<number, { usmRegistry: Address }>;
