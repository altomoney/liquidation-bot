import { sepolia } from "viem/chains";

export const uniswapV3SubgraphOverrides: Record<
  number,
  { url: string; bearerToken?: string }
> = {
  [sepolia.id]: {
    url: "https://gateway.thegraph.com/api/subgraphs/id/EDJCBpDBGBajTP1x3qLGLg3ZaVR5Q2TkNxyNHdCuryex",
    bearerToken: process.env.UNISWAP_V3_SUBGRAPH_BEARER_TOKEN,
  },
};
