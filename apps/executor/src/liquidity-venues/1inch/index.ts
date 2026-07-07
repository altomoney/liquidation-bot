import { chainConfig, DEFAULT_SLIPPAGE_PERCENTAGE } from "@/config/index";
import { BigIntish } from "@/types";
import { ENV } from "@/utils/env";
import { ExecutorEncoder } from "executooor-viem";
import { Address } from "viem";
import { ToConvert } from "../../utils/types";
import { LiquidityVenue } from "../types";
import { EXCLUDED_PROTOCOLS, ONE_INCH_LIQUIDITY_VENUE_CONFIG } from "./config";
import { SwapParams, SwapResponse } from "./types";

export class OneInch implements LiquidityVenue {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = ENV.ONE_INCH_SWAP_API_KEY;
  }

  supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    if (src === dst) return false;
    return ONE_INCH_LIQUIDITY_VENUE_CONFIG.supportedNetworks.includes(
      encoder.client.chain.id,
    );
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    try {
      const config = chainConfig(encoder.client.chain.id);
      const slippage = config.slippagePercentage
        ? config.slippagePercentage
        : DEFAULT_SLIPPAGE_PERCENTAGE;
      const swapResponse = await this.fetchSwap({
        chainId: encoder.client.chain.id,
        src: toConvert.src,
        dst: toConvert.dst,
        amount: toConvert.srcAmount,
        from: encoder.address,
        slippage,
        origin: encoder.client.account.address,
        includeTokensInfo: false,
        includeProtocols: false,
        includeGas: false,
        allowPartialFill: false,
        disableEstimate: true,
        usePermit2: false,
        excludedProtocols: EXCLUDED_PROTOCOLS,
      });

      encoder
        .erc20Approve(toConvert.src, swapResponse.tx.to, toConvert.srcAmount)
        .pushCall(
          swapResponse.tx.to,
          BigInt(swapResponse.tx.value),
          swapResponse.tx.data,
        );

      /// assumed to be the last liquidity venue
      return {
        src: toConvert.dst,
        dst: toConvert.dst,
        srcAmount: BigInt(swapResponse.dstAmount),
      };
    } catch (error) {
      throw new Error(
        `(1inch) Error fetching swap response: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private getSwapApiPath = (chainId: BigIntish) => `/swap/v6.1/${chainId}/swap`;

  private async fetchSwap(swapParams: SwapParams) {
    const url = new URL(
      this.getSwapApiPath(swapParams.chainId),
      ONE_INCH_LIQUIDITY_VENUE_CONFIG.apiBaseUrl,
    );
    Object.entries(swapParams).forEach(([key, value]) => {
      if (value == null) return;
      switch (key) {
        case "slippage":
          // 1inch expects slippage as a percentage, matching our config value.
          url.searchParams.set(key, Number(value).toString(10));
          break;
        default:
          url.searchParams.set(key, String(value));
      }
    });

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const responseText = await res.text();

    if (!res.ok) {
      let errorMessage = res.statusText;
      try {
        const errorBody = JSON.parse(responseText) as {
          description?: string;
          error?: string;
          code?: string;
        };
        errorMessage =
          errorBody.description ??
          errorBody.error ??
          errorBody.code ??
          res.statusText;
      } catch {}
      throw Error(errorMessage);
    }

    return JSON.parse(responseText) as SwapResponse;
  }
}

export * from "./config";
