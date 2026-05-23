import { BigIntish } from "@/types";
import { Address, Hex } from "viem";

export interface SwapParams {
  chainId: BigIntish;
  src: string;
  dst: string;
  amount: BigIntish;
  from: string;
  origin: string;
  slippage: string;
  protocols?: string;
  fee?: BigIntish;
  gasPrice?: BigIntish;
  complexityLevel?: number;
  parts?: number;
  mainRouteParts?: number;
  gasLimit?: BigIntish;
  includeTokensInfo?: boolean;
  includeProtocols?: boolean;
  includeGas?: boolean;
  connectorTokens?: string;
  excludedProtocols?: string;
  permit?: string;
  receiver?: string;
  referrer?: string;
  allowPartialFill?: boolean;
  disableEstimate?: boolean;
  usePermit2?: boolean;
}

interface SwapToken {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  logoURI: string;
}

export interface SwapResponse {
  srcToken: SwapToken;
  dstToken: SwapToken;
  dstAmount: string;
  protocols: {}[];
  tx: {
    to: Address;
    data: Hex;
    value: bigint;
  };
}
