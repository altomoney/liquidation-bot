import { BigIntish } from "@/types";
import { parseUnits } from "viem";
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
  slippage: BigIntish;
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
  slippage: parseUnits("0.01", 18) / 10n ** 14n, // 0.01%
  apiBaseUrl: "https://api.1inch.dev",
};
