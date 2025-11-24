import { sepolia } from "viem/chains";

import type { Config } from "./types";

export const COOLDOWN_ENABLED = false; // true if you want to enable the cooldown mechanism
export const COOLDOWN_PERIOD = 60 * 60; // 1 hour
export const ALWAYS_REALIZE_BAD_DEBT = false; // true if you want to always realize bad debt

export const chainConfigs: Record<number, Config> = {
  [sepolia.id]: {
    chain: sepolia,
    wNative: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // uniswap v3 weth
    markets: [
      "0x0ad372969FFb9409b270E7e38e93B128CE065141",
      "0x06E7Fa2e4C0e1B33D1B036E161df78d3e0e1c53E",
    ],
    options: {
      checkProfit: false,
      liquidationBufferBps: 50,
      useFlashbots: false,
      blockInterval: 2,
      isPriorityLiquidator: false,
    },
  },
};
