import { Address, createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { MarketRegistryAbi } from "../../abis/MarketRegistryAbi";
import { ENV } from "./env";

const getSelectedChain = () => {
  if (ENV.CHAIN_ID === 1) {
    return mainnet;
  } else if (ENV.CHAIN_ID === 11155111) {
    return sepolia;
  } else {
    throw new Error(`Chain ID ${ENV.CHAIN_ID} not supported`);
  }
};

export async function getMarketAddresses() {
  const client = createPublicClient({
    chain: getSelectedChain(),
    transport: http(ENV.RPC_URL),
  });

  const [mintMarkets, borrowMarkets] = await Promise.all([
    client.readContract({
      address: ENV.MARKET_REGISTRY_ADDRESS,
      abi: MarketRegistryAbi,
      functionName: "getMintMarkets",
    }),
    client.readContract({
      address: ENV.MARKET_REGISTRY_ADDRESS,
      abi: MarketRegistryAbi,
      functionName: "getBorrowMarkets",
    }),
  ]);

  return {
    mintMarkets: mintMarkets as Address[],
    borrowMarkets: borrowMarkets as Address[],
    allMarkets: [...mintMarkets, ...borrowMarkets] as Address[],
  };
}
