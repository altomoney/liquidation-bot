import { mainnet, sepolia } from "viem/chains";

import type { Config } from "./types";

export const COOLDOWN_ENABLED = false; // true if you want to enable the cooldown mechanism
export const COOLDOWN_PERIOD = 60 * 60; // 1 hour
export const ALWAYS_REALIZE_BAD_DEBT = true; // true if you want to always realize bad debt
export const DEFAULT_SLIPPAGE_PERCENTAGE = 1; // 1%

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
      stableRouteMode: "swap_only",
      usmSellAdapterAddress: "0x0000000000000000000000000000000000000000",
      liquidationPeripheryAddress: "0x0000000000000000000000000000000000000000",
    },
  },
  [mainnet.id]: {
    chain: mainnet,
    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // weth
    options: {
      liquidationBufferBps: 50,
      minSeizableCollateralUsd: 10,
      blockInterval: 2,
      averageBlockTimeSeconds: 12,
      slippagePercentage: DEFAULT_SLIPPAGE_PERCENTAGE,
      isPriorityLiquidator: false,
      stableRouteMode: "periphery_usm_then_swap",
      usmSellAdapterAddress: "0xaAC86f77Eb51Fa1D565b743c43deCE2CEF90AF24",
      liquidationPeripheryAddress: "0xa9DDC8833A7eEcbcFd48F6cBa17c521099683615",
      liquidityVenues: [
        "pendlePT",
        "midas",
        "1inch",
        "erc20Wrapper",
        "erc4626",
        "uniswapV3",
        "uniswapV4",
      ],
      pricers: ["stablecoin", "defillama", "chainlink", "uniswapV3"],
    },
  },
};
