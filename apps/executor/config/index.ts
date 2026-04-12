import { ENV } from "@/utils/env";
import { chainConfigs } from "./config";
import type { ChainConfig } from "./types";

export function chainConfig(chainId: number): ChainConfig {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`No config found for chainId ${chainId}`);
  }

  if (!ENV.CHAIN_CONFIGS[chainId]) {
    throw new Error(`No chain config found for chainId ${chainId}`);
  }
  const { rpcUrl, privateKey, executorAddress } = ENV.CHAIN_CONFIGS[chainId];
  return {
    // Hoist all parameters from `options` up 1 level, i.e. flatten the config as much as possible.
    ...(({ options, ...c }) => ({ ...options, ...c }))(config),
    chainId,
    rpcUrl,
    executorAddress,
    liquidationPrivateKey: privateKey,
  };
}

export {
  ALWAYS_REALIZE_BAD_DEBT,
  COOLDOWN_ENABLED,
  COOLDOWN_PERIOD,
} from "./config";
export { chainConfigs, type ChainConfig };
