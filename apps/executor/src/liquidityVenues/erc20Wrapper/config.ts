import type { Address } from "viem";
import { base, mainnet } from "viem/chains";

export const ERC20_WRAPPER_LIQUIDITY_VENUE_CONFIGS: Record<
  number,
  Record<Address, Address>
> = {
  [mainnet.id]: {},
  [base.id]: {},
};
