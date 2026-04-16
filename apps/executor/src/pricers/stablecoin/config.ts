import { Address } from "viem";
import { mainnet } from "viem/chains";

export const STABLECOIN_PRICER_CONFIG: Record<
  number,
  {
    stablecoins: Address[];
  }
> = {
  [mainnet.id]: {
    stablecoins: ["0x63d74d22E689C715a04F2C13962b1f77F443d35b"], // DUSD
  },
};
