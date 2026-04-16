import { chainConfigs } from "@/config/config";
import { Address, Hex } from "viem";

const ponderServiceUrl =
  process.env.PONDER_SERVICE_URL ?? "http://localhost:42069";
if (!process.env.PONDER_SERVICE_URL) {
  console.log(
    `PONDER_SERVICE_URL is not set, using default: ${ponderServiceUrl}`
  );
}

const uniswapV3SubgraphBearerToken =
  process.env.UNISWAP_V3_SUBGRAPH_BEARER_TOKEN;
const oneInchSwapApiKey = process.env.ONE_INCH_SWAP_API_KEY;
const odosApiKey = process.env.ODOS_API_KEY;
const flashbotsPrivateKey = process.env.FLASHBOTS_PRIVATE_KEY;
const skipCheckForProfit = process.env.SKIP_CHECK_FOR_PROFIT === "true";

const CHAIN_CONFIGS: Record<
  string,
  { rpcUrl: string; privateKey: Hex; executorAddress: Address }
> = {};

for (const chainId of Object.keys(chainConfigs)) {
  const rpcUrl = process.env[`RPC_URL_${chainId}`];
  if (!rpcUrl) {
    console.log(`RPC_URL_${chainId} is not set. Skipping chain ${chainId}.`);
    continue;
  }
  const privateKey = process.env[`LIQUIDATION_PRIVATE_KEY_${chainId}`];
  if (!privateKey) {
    throw new Error(`LIQUIDATION_PRIVATE_KEY_${chainId} is not set`);
  }
  const executorAddress = process.env[`EXECUTOR_ADDRESS_${chainId}`];
  if (!executorAddress) {
    throw new Error(`EXECUTOR_ADDRESS_${chainId} is not set`);
  }

  CHAIN_CONFIGS[chainId] = {
    rpcUrl,
    privateKey: privateKey as Hex,
    executorAddress: executorAddress as Address,
  };
}

export const ENV = {
  PONDER_SERVICE_URL: ponderServiceUrl,
  UNISWAP_V3_SUBGRAPH_BEARER_TOKEN: uniswapV3SubgraphBearerToken,
  ONE_INCH_SWAP_API_KEY: oneInchSwapApiKey,
  ODOS_API_KEY: odosApiKey,
  FLASHBOTS_PRIVATE_KEY: flashbotsPrivateKey,
  USE_FLASHBOTS:
    flashbotsPrivateKey !== undefined && flashbotsPrivateKey !== "",
  CHECK_PROFIT: !skipCheckForProfit,
  CHAIN_CONFIGS,
};
