import { CurrencyAmount, Percent, Token, TradeType } from "@uniswap/sdk-core";
import {
  AlphaRouter,
  SwapType,
  V3SubgraphProvider,
} from "@uniswap/smart-order-router";
import { ExecutorEncoder } from "executooor-viem";
import { type Address, erc20Abi } from "viem";
import { readContract } from "viem/actions";

import { uniswapV3SubgraphOverrides } from "@/config/liquidityVenues/uniswapSmartOrderRouter";
import { ethers } from "ethers";
import type { ToConvert } from "../../utils/types";
import type { LiquidityVenue } from "../liquidityVenue";

export class UniswapSmartOrderRouterVenue implements LiquidityVenue {
  private routers: Map<number, AlphaRouter> = new Map();
  private tokenCache: Map<string, Token> = new Map();

  /**
   * Check if the venue supports the route between src and dst tokens.
   */
  async supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    console.log(`(UniswapSmartOrderRouter) Checking route`, { src, dst });
    if (src === dst) return false;

    try {
      const router = this.getOrCreateRouter(encoder);
      const [srcToken, dstToken] = await Promise.all([
        this.getToken(encoder, src),
        this.getToken(encoder, dst),
      ]);

      // Try to get a route with a reasonable test amount
      // Use 1 token (in the token's native decimals) for testing
      const testAmount = BigInt(10 ** srcToken.decimals);
      const amount = CurrencyAmount.fromRawAmount(
        srcToken,
        testAmount.toString()
      );

      console.log(
        `(UniswapSmartOrderRouter) Testing with amount: ${amount.toExact()} ${
          srcToken.symbol
        }`
      );

      const route = await router.route(
        amount,
        dstToken,
        TradeType.EXACT_INPUT,
        {
          type: SwapType.SWAP_ROUTER_02,
          recipient: encoder.address,
          slippageTolerance: new Percent(50, 10000), // 0.5%
          deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        }
      );

      const isSupported = route !== null;

      if (route) {
        console.log(`(UniswapSmartOrderRouter) Route found:`, {
          supported: true,
          route: route.route.map((r) => r.protocol).join(" -> "),
          tokenPath: route.route
            .flatMap((r) => r.tokenPath.map((t) => t.symbol))
            .join(" -> "),
          amount: amount.toExact(),
          oneUnitPrice: route.quote.toExact(),
        });
      } else {
        console.log(
          `(UniswapSmartOrderRouter) No route found between ${srcToken.symbol} and ${dstToken.symbol}`
        );
      }

      return isSupported;
    } catch (error) {
      console.error(
        `(UniswapSmartOrderRouter) Error checking route:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Convert the amount from src to dst using the best route found by the smart order router.
   */
  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    console.log(`(UniswapSmartOrderRouter) Converting`, {
      src,
      dst,
      srcAmount: srcAmount.toString(),
    });

    try {
      const router = this.getOrCreateRouter(encoder);
      const [srcToken, dstToken] = await Promise.all([
        this.getToken(encoder, src),
        this.getToken(encoder, dst),
      ]);

      const amount = CurrencyAmount.fromRawAmount(
        srcToken,
        srcAmount.toString()
      );

      console.log(`(UniswapSmartOrderRouter) Finding best route...`);
      const route = await router.route(
        amount,
        dstToken,
        TradeType.EXACT_INPUT,
        {
          type: SwapType.SWAP_ROUTER_02,
          recipient: encoder.address,
          slippageTolerance: new Percent(50, 10000), // 0.5%
          deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        }
      );

      if (!route) {
        throw new Error("No route found");
      }

      console.log(`(UniswapSmartOrderRouter) Route found:`, {
        quote: route.quote.toExact(),
        quoteGasAdjusted: route.quoteGasAdjusted.toExact(),
        estimatedGasUsed: route.estimatedGasUsed.toString(),
        protocols: route.route.map((r) => r.protocol).join(" -> "),
        tokenPath: route.route
          .flatMap((r) => r.tokenPath.map((t) => t.symbol))
          .join(" -> "),
      });

      // Approve the router to spend the source token
      const routerAddress = route.methodParameters?.to as Address;
      encoder.erc20Approve(src, routerAddress, srcAmount);

      // Execute the swap
      if (!route.methodParameters) {
        throw new Error("No method parameters returned from router");
      }

      encoder.pushCall(
        routerAddress,
        BigInt(route.methodParameters.value),
        route.methodParameters.calldata as `0x${string}`
      );

      // Return the updated state (assumed to be the last liquidity venue)
      return {
        src: dst,
        dst: dst,
        srcAmount: 0n,
      };
    } catch (error) {
      throw new Error(
        `(UniswapSmartOrderRouter) Error converting: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get or create an AlphaRouter instance for the chain.
   */
  private getOrCreateRouter(encoder: ExecutorEncoder): AlphaRouter {
    const chainId = encoder.client.chain.id;

    if (!this.routers.has(chainId)) {
      const provider = new ethers.providers.JsonRpcProvider(
        encoder.client.transport.url
      );

      const routerConfig: any = {
        chainId,
        provider,
      };

      if (uniswapV3SubgraphOverrides[chainId]) {
        const v3SubgraphProvider = new V3SubgraphProvider(
          chainId,
          2,
          30000,
          true,
          0.01,
          Number.MAX_VALUE,
          uniswapV3SubgraphOverrides[chainId].url,
          uniswapV3SubgraphOverrides[chainId].bearerToken
        );

        routerConfig.v3SubgraphProvider = v3SubgraphProvider;
      }

      const router = new AlphaRouter(routerConfig);
      this.routers.set(chainId, router);
    }

    return this.routers.get(chainId)!;
  }

  /**
   * Get token information (symbol, decimals, name) and create a Token instance.
   */
  private async getToken(
    encoder: ExecutorEncoder,
    address: Address
  ): Promise<Token> {
    const cacheKey = `${encoder.client.chain.id}-${address}`;

    if (this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey)!;
    }

    try {
      const [decimals, symbol, name] = await Promise.all([
        readContract(encoder.client, {
          address,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        readContract(encoder.client, {
          address,
          abi: erc20Abi,
          functionName: "symbol",
        }),
        readContract(encoder.client, {
          address,
          abi: erc20Abi,
          functionName: "name",
        }),
      ]);

      const token = new Token(
        encoder.client.chain.id,
        address,
        decimals,
        symbol,
        name
      );

      this.tokenCache.set(cacheKey, token);
      return token;
    } catch (error) {
      throw new Error(
        `(UniswapSmartOrderRouter) Error fetching token info for ${address}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
