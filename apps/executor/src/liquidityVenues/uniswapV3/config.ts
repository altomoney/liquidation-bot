import type { Address } from "viem";
import { base, sepolia, unichain, worldchain } from "viem/chains";

export const UNISWAP_V3_LIQUIDITY_VENUE_CONFIG: {
  minSqrtRatio: bigint;
  maxSqrtRatio: bigint;
  defaultFactoryAddress: Address;
  specificFactoryAddresses: Record<number, Address>;
  feeTiers: number[];
} = {
  minSqrtRatio: 4295128739n,
  maxSqrtRatio: 1461446703485210103287273052203988822378723970342n,
  defaultFactoryAddress:
    "0x1F98431c8aD98523631AE4a59f267346ea31F984" as Address,
  specificFactoryAddresses: {
    [base.id]: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    [unichain.id]: "0x1F98400000000000000000000000000000000003",
    [worldchain.id]: "0x7a5028BDa40e7B173C278C5342087826455ea25a",
    [sepolia.id]: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  },
  feeTiers: [100, 500, 3000, 10000],
};
