import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  unichain,
} from "viem/chains";

// Off-chain/intent-based protocols that are unreliable on forked chains
export const EXCLUDED_PROTOCOLS = [
  "EKUBO",
  "EKUBO_V3",
  "ONE_INCH_LIMIT_ORDER",
  "ONE_INCH_LIMIT_ORDER_V2",
  "ONE_INCH_LIMIT_ORDER_V3",
  "ONE_INCH_LIMIT_ORDER_V4",
  "PMM11",
  "PMM15",
  "ZEROX_LIMIT_ORDER",
].join(",");

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
