import { mainnet } from "viem/chains";

export const ODOS_LIQUIDITY_VENUE_CONFIG = {
  supportedNetworks: [mainnet.id],
  apiBaseUrl: "https://api.odos.xyz",
} as const;
