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
const flashbotsPrivateKey = process.env.FLASHBOTS_PRIVATE_KEY;
const skipCheckForProfit = process.env.SKIP_CHECK_FOR_PROFIT === "true";

export const ENV = {
  PONDER_SERVICE_URL: ponderServiceUrl,
  UNISWAP_V3_SUBGRAPH_BEARER_TOKEN: uniswapV3SubgraphBearerToken,
  ONE_INCH_SWAP_API_KEY: oneInchSwapApiKey,
  FLASHBOTS_PRIVATE_KEY: flashbotsPrivateKey,
  IS_USING_FLASHBOTS:
    flashbotsPrivateKey !== undefined && flashbotsPrivateKey !== "",
  SKIP_CHECK_FOR_PROFIT: skipCheckForProfit,
};
