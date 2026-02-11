import type { Account, Address, Chain, Client, Transport } from "viem";
import { getAddress } from "viem";

import type { Pricer } from "../pricer";

/**
 * A simple pricer for stablecoins known to be pegged to $1.
 * Returns 1.0 for any token in the set, undefined otherwise.
 */
export class StablecoinPricer implements Pricer {
  private readonly stablecoins: Set<Address>;

  constructor(stablecoins: Address[]) {
    this.stablecoins = new Set(stablecoins.map((a) => getAddress(a)));
  }

  price(
    _client: Client<Transport, Chain, Account>,
    asset: Address,
  ): number | undefined {
    return this.stablecoins.has(getAddress(asset)) ? 1.0 : undefined;
  }
}
