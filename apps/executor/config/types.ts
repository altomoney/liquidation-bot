import type { Address, Chain, Hex } from "viem";

export type LiquidityVenueName =
  | "1inch"
  | "odos"
  | "erc20Wrapper"
  | "erc4626"
  | "midas"
  | "pendlePT"
  | "uniswapV3"
  | "uniswapV4";

export type PricerName =
  | "chainlink"
  | "defillama"
  | "morpho"
  | "uniswapV3"
  | "stablecoin";

export type UsmMode = "always" | "never" | "if_better";

export interface Config {
  chain: Chain;
  wNative: Address;
  options: Options;
}

export interface Options {
  liquidityVenues: LiquidityVenueName[];
  useUsm?: UsmMode;
  usmSellAdapterAddress: Address;
  pricers?: PricerName[];
  treasuryAddress?: Address;
  liquidationBufferBps?: number;
  blockInterval?: number;
  watchBlocksRetryDelayMs?: number;
  slippagePercentage?: number;
  // NOT IMPLEMENTED YET
  isPriorityLiquidator: boolean;
}

export type ChainConfig = Omit<Config, "options"> &
  Options & {
    chainId: number;
    rpcUrl: string;
    executorAddress: Address;
    liquidationPrivateKey: Hex;
  };
