import {
  formatUnits,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import { readContract } from "viem/actions";
import { mainnet } from "viem/chains";

import { feedRegistryAbi } from "../../abis/feed-registry-abi";
import type { Pricer } from "../types";

type CoinKey = `${string}:${Address}`;

// Static configurations for Chainlink pricer
const CHAINLINK_PRICER_CONFIG: Record<
  number,
  {
    denominations: Record<string, Address>;
    mappings: Record<Address, Address>;
    feedRegistryAddress: Address;
    cacheTimeoutMs: number;
  }
> = {
  [mainnet.id]: {
    // ISO 4217 denominations used by Chainlink
    denominations: {
      EUR: "0x00000000000000000000000000000000000003d2",
      GBP: "0x000000000000000000000000000000000000033a",
      USD: "0x0000000000000000000000000000000000000348",
      ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      BTC: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
    },
    mappings: {
      ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"]:
        "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // WETH → ETH
      ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"]:
        "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB", // WBTC → BTC
    },
    feedRegistryAddress: "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf",
    cacheTimeoutMs: 30_000,
  },
};

interface CachedPrice {
  price: number;
  fetchTimestamp: number;
}

export class ChainlinkPricer implements Pricer {
  private priceCache = new Map<CoinKey, CachedPrice>();

  async price(
    client: Client<Transport, Chain, Account>,
    asset: Address,
  ): Promise<number | undefined> {
    const config = CHAINLINK_PRICER_CONFIG[client.chain.id];
    if (!config) {
      console.warn(
        `Trying to use Chainlink pricer on an unsupported chain: ${client.chain.name}`,
      );
      return undefined;
    }
    asset = config.mappings[asset] ?? asset;

    const coinKey: CoinKey = `${client.chain.name}:${asset}`;
    const cachedPrice = this.priceCache.get(coinKey);

    // Return cached price if available and not expired
    if (
      cachedPrice &&
      Date.now() - cachedPrice.fetchTimestamp < config.cacheTimeoutMs
    ) {
      return cachedPrice.price;
    }

    const usdDenomination = config.denominations.USD;
    if (!usdDenomination) {
      console.warn(
        `USD denomination not found for chain: ${client.chain.name}`,
      );
      return undefined;
    }

    try {
      // Query price from Feed Registry
      const [roundData, decimals] = await Promise.all([
        readContract(client, {
          address: config.feedRegistryAddress,
          abi: feedRegistryAbi,
          functionName: "latestRoundData",
          args: [asset, usdDenomination],
        }),
        readContract(client, {
          address: config.feedRegistryAddress,
          abi: feedRegistryAbi,
          functionName: "decimals",
          args: [asset, usdDenomination],
        }),
      ]);

      // Extract price from round data (answer is the price)
      const rawPrice = roundData[1];

      // Ensure price is positive
      if (rawPrice <= 0n) {
        return undefined;
      }

      // Convert to proper decimal representation
      const price = Number(formatUnits(rawPrice, decimals));

      // Cache the result
      this.priceCache.set(coinKey, { price, fetchTimestamp: Date.now() });

      return price;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error fetching Chainlink price for ${asset}:`, error);
      } else {
        console.error(
          `Error fetching Chainlink price for ${asset}:`,
          String(error),
        );
      }
      return undefined;
    }
  }
}
