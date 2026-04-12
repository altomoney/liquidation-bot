import { mainnet, sepolia } from "viem/chains";

import type { Config } from "./types";

export const COOLDOWN_ENABLED = false; // true if you want to enable the cooldown mechanism
export const COOLDOWN_PERIOD = 60 * 60; // 1 hour
export const ALWAYS_REALIZE_BAD_DEBT = true; // true if you want to always realize bad debt

export const chainConfigs: Record<number, Config> = {
  [sepolia.id]: {
    chain: sepolia,
    wNative: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // uniswap v3 weth
    options: {
      liquidityVenues: [],
      pricers: [],
      liquidationBufferBps: 50,
      blockInterval: 2,
      isPriorityLiquidator: false,
    },
  },
  [mainnet.id]: {
    chain: mainnet,
    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // weth
    options: {
      liquidationBufferBps: 50,
      blockInterval: 2,
      isPriorityLiquidator: false,
      liquidityVenues: [
        "pendlePT",
        "midas",
        "1inch",
        "odos",
        "erc20Wrapper",
        "erc4626",
        "uniswapV3",
        "uniswapV4",
      ],
      pricers: ["stablecoin", "defillama", "chainlink", "uniswapV3"],
    },
  },
};
