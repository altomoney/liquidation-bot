import type { Address, Hex } from "viem";

export interface OdosQuoteRequest {
  chainId: number;
  inputTokens: {
    tokenAddress: Address;
    amount: string;
  }[];
  outputTokens: {
    tokenAddress: Address;
    proportion: number;
  }[];
  userAddr: Address;
  slippageLimitPercent: number;
  compact: boolean;
}

export interface OdosQuoteResponse {
  pathId?: string;
  outAmounts?: string[];
  gasEstimate?: number;
  priceImpact?: number;
  traceId?: string;
  detail?: string;
  error?: string;
}

export interface OdosAssembleRequest {
  userAddr: Address;
  pathId: string;
  receiver: Address;
  simulate: boolean;
}

export interface OdosAssembleResponse {
  blockNumber?: number;
  gasEstimate?: number;
  transaction?: {
    to: Address;
    from: Address;
    data: Hex;
    value: string;
    gas?: number;
    gasPrice?: string;
    nonce?: number;
    chainId?: number;
  };
  detail?: string;
  error?: string;
}
