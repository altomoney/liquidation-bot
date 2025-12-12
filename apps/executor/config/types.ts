import type { Address, Chain, Hex } from "viem";

export interface Config {
  chain: Chain;
  wNative: Address;
  options: Options;
}

export interface Options {
  treasuryAddress?: Address;
  liquidationBufferBps?: number;
  blockInterval?: number;
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
