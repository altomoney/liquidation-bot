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
      "0xD67062b0bc443c656C2A07A0B1cceEACF114DA06",
      "0x4d40ddc251Db7F9b24efF017dd26f2294F8d573b",
    ],
    usms: ["0xFb63Ce5146b284b0d573272a9D670A6856d899dC"],
    options: {
      checkProfit: false,
      liquidationBufferBps: 50,
      useFlashbots: false,
      blockInterval: 2,
      isPriorityLiquidator: false,
    },
  },
};
