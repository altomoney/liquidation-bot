import { ENV } from "@/utils/env";
import { ExecutorEncoder } from "executooor-viem";
import type { Address } from "viem";

import { chainConfig, DEFAULT_SLIPPAGE_PERCENTAGE } from "@/config/index";
import type { ToConvert } from "../../utils/types";
import type { LiquidityVenue } from "../types";
import { ODOS_LIQUIDITY_VENUE_CONFIG } from "./config";
import type {
  OdosAssembleRequest,
  OdosAssembleResponse,
  OdosQuoteRequest,
  OdosQuoteResponse,
} from "./types";

export class Odos implements LiquidityVenue {
  private apiKey: string | undefined;
  constructor() {
    this.apiKey = ENV.ODOS_API_KEY;
  }

  supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    if (src === dst) return false;
    return ODOS_LIQUIDITY_VENUE_CONFIG.supportedNetworks.some(
      (chainId) => chainId === encoder.client.chain.id,
    );
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    try {
      const config = chainConfig(encoder.client.chain.id);
      const slippage = config.slippagePercentage
        ? config.slippagePercentage
        : DEFAULT_SLIPPAGE_PERCENTAGE;
      const quote = await this.fetchQuote({
        chainId: encoder.client.chain.id,
        inputTokens: [
          {
            tokenAddress: toConvert.src,
            amount: toConvert.srcAmount.toString(),
          },
        ],
        outputTokens: [
          {
            tokenAddress: toConvert.dst,
            proportion: 1,
          },
        ],
        userAddr: encoder.address,
        slippageLimitPercent: slippage,
        compact: true,
      });
      if (!quote.pathId) {
        throw new Error(quote.detail ?? quote.error ?? "No pathId returned");
      }

      const assembled = await this.fetchAssembledTransaction({
        userAddr: encoder.address,
        pathId: quote.pathId,
        receiver: encoder.address,
        simulate: false,
      });

      if (!assembled.transaction) {
        throw new Error(
          assembled.detail ?? assembled.error ?? "No transaction returned",
        );
      }

      encoder
        .erc20Approve(
          toConvert.src,
          assembled.transaction.to,
          toConvert.srcAmount,
        )
        .pushCall(
          assembled.transaction.to,
          BigInt(assembled.transaction.value),
          assembled.transaction.data,
        );

      return {
        src: toConvert.dst,
        dst: toConvert.dst,
        srcAmount: quote.outAmounts?.[0] ? BigInt(quote.outAmounts[0]) : 0n,
      };
    } catch (error) {
      throw new Error(
        `(Odos) Error fetching swap response: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async fetchQuote(
    quoteRequest: OdosQuoteRequest,
  ): Promise<OdosQuoteResponse> {
    const response = await fetch(
      `${ODOS_LIQUIDITY_VENUE_CONFIG.apiBaseUrl}/sor/quote/v3`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(quoteRequest),
      },
    );

    const quote = (await response.json()) as OdosQuoteResponse;

    if (!response.ok) {
      throw new Error(quote.detail ?? quote.error ?? response.statusText);
    }

    return quote;
  }

  private async fetchAssembledTransaction(
    assembleRequest: OdosAssembleRequest,
  ): Promise<OdosAssembleResponse> {
    const response = await fetch(
      `${ODOS_LIQUIDITY_VENUE_CONFIG.apiBaseUrl}/sor/assemble`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(assembleRequest),
      },
    );

    const assembled = (await response.json()) as OdosAssembleResponse;

    if (!response.ok) {
      throw new Error(
        assembled.detail ?? assembled.error ?? response.statusText,
      );
    }

    return assembled;
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };
  }
}

export * from "./config";
