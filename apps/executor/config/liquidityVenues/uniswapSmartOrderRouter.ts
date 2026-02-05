import { mainnet, sepolia } from "viem/chains";
import { Address } from "viem";

export const uniswapV3SubgraphOverrides: Record<number, { url: string }> = {
  [sepolia.id]: {
    url: "https://gateway.thegraph.com/api/subgraphs/id/EDJCBpDBGBajTP1x3qLGLg3ZaVR5Q2TkNxyNHdCuryex",
  },
};

/**
 * Preferred intermediate tokens to try when routing.
 * Maps: chainId -> source token -> list of intermediate tokens to try
 * 
 * This is especially useful for tokens like cbBTC that have low direct liquidity
 * to stablecoins but high liquidity to WBTC.
 */
export const preferredIntermediateTokens: Record<
  number,
  Record<Address, Address[]>
> = {
  [mainnet.id]: {
    // cbBTC -> try routing through WBTC first (much higher liquidity)
    "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf": [
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    ],
    // rETH -> try routing through WETH first
    "0xae78736Cd615f374D3085123A210448E74Fc6393": [
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    ],
  },
};
