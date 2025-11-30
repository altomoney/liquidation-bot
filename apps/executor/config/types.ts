import type { Address, Chain, Hex } from "viem";

export interface Config {
  chain: Chain;
  markets: Hex[];
  usms: Hex[];
  wNative: Address;
  options: Options;
}

export interface Options {
  checkProfit: boolean;
  treasuryAddress?: Address;
  liquidationBufferBps?: number;
  useFlashbots: boolean;
  blockInterval?: number;
  isPriorityLiquidator: boolean;
}

export type ChainConfig = Omit<Config, "options"> &
  Options & {
    chainId: number;
    rpcUrl: string;
    executorAddress: Address;
    liquidationPrivateKey: Hex;
  };
