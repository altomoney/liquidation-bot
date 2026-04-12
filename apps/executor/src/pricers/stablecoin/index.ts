import type { Account, Address, Chain, Client, Transport } from "viem";

import type { Pricer } from "../types";
import { STABLECOIN_PRICER_CONFIG } from "./config";

/**
 * A simple pricer for stablecoins known to be pegged to $1.
 * Returns 1.0 for any token in the set, undefined otherwise.
 */
export class StablecoinPricer implements Pricer {
  price(
    _client: Client<Transport, Chain, Account>,
    asset: Address,
  ): number | undefined {
    const config = STABLECOIN_PRICER_CONFIG[_client.chain.id];

    if (!config) {
      console.warn(
        `Trying to use Stablecoin pricer on an unsupported chain: ${_client.chain.name}`,
      );
      return undefined;
    }

    return config.stablecoins.includes(asset) ? 1.0 : undefined;
  }
}
