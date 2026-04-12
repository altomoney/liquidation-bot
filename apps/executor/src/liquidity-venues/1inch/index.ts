import { BigIntish } from "@/types";
import { ENV } from "@/utils/env";
import { ExecutorEncoder } from "executooor-viem";
import { Address, parseUnits } from "viem";
import { ToConvert } from "../../utils/types";
import { LiquidityVenue } from "../types";
import { ONE_INCH_LIQUIDITY_VENUE_CONFIG } from "./config";
import { SwapParams, SwapResponse } from "./types";
import { chainConfig } from "@/config/index";

export class OneInch implements LiquidityVenue {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = ENV.ONE_INCH_SWAP_API_KEY;
  }

  supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    if (src === dst) return false;
    if (
      !ONE_INCH_LIQUIDITY_VENUE_CONFIG.supportedNetworks.includes(
        encoder.client.chain.id,
      )
    )
      return false;
    return this.apiKey !== undefined;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    try {
      const config = chainConfig(encoder.client.chain.id);
      const slippage = config.slippagePercentage ? config.slippagePercentage : 0.01; // 0.01% default
      const swapResponse = await this.fetchSwap({
        chainId: encoder.client.chain.id,
        src: toConvert.src,
        dst: toConvert.dst,
        amount: toConvert.srcAmount,
        from: encoder.address,
        slippage: parseUnits(slippage.toFixed(18), 18) / 10n ** 14n,
        origin: encoder.client.account.address,
        includeTokensInfo: false,
        includeProtocols: false,
        includeGas: false,
        allowPartialFill: false,
        disableEstimate: true,
        usePermit2: false,
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
        srcAmount: 0n,
      };
    } catch (error) {
      throw new Error(
        `(1inch) Error fetching swap response: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private getSwapApiPath = (chainId: BigIntish) => `/swap/v6.0/${chainId}/swap`;

  private async fetchSwap(swapParams: SwapParams) {
    const url = new URL(
      this.getSwapApiPath(swapParams.chainId),
      ONE_INCH_LIQUIDITY_VENUE_CONFIG.apiBaseUrl,
    );
    Object.entries(swapParams).forEach(([key, value]) => {
      if (value == null) return;
      switch (key) {
        case "slippage":
          // 1inch expects slippage as a percentage, so we divide our value (in basis points) by 100
          url.searchParams.set(key, (Number(value) / 100).toString(10));
          break;
        default:
          url.searchParams.set(key, value);
      }
    });

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) throw Error(res.statusText);

    return (await res.json()) as SwapResponse;
  }
}

export * from "./config";
