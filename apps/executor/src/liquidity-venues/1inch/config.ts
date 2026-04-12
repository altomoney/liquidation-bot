import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  unichain,
} from "viem/chains";

export const ONE_INCH_LIQUIDITY_VENUE_CONFIG: {
  supportedNetworks: number[];
  apiBaseUrl: string;
} = {
  supportedNetworks: [
    mainnet.id,
    base.id,
    optimism.id,
    polygon.id,
    arbitrum.id,
    unichain.id,
  ],
  // TODO consider moving slippage to global config
  apiBaseUrl: "https://api.1inch.dev",
};
