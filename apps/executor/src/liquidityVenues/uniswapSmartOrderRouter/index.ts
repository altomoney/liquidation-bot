import { CurrencyAmount, Percent, Token, TradeType } from "@uniswap/sdk-core";
import {
  AlphaRouter,
  SwapRoute,
  SwapType,
  V3SubgraphProvider,
} from "@uniswap/smart-order-router";
import { ExecutorEncoder } from "executooor-viem";
import { getAddress, type Address, erc20Abi } from "viem";
import { readContract } from "viem/actions";

import {
  preferredIntermediateTokens,
  uniswapV3SubgraphOverrides,
} from "@/config/liquidityVenues/uniswapSmartOrderRouter";
import { ENV } from "@/utils/env";
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
   * If preferred intermediate tokens are configured, tries routes through them and picks the best.
   */
  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    console.log(`(UniswapSmartOrderRouter) Converting`, {
      src,
      dst,
      srcAmount: srcAmount.toString(),
    });

    try {
      const chainId = encoder.client.chain.id;
      const router = this.getOrCreateRouter(encoder);
      const [srcToken, dstToken] = await Promise.all([
        this.getToken(encoder, src),
        this.getToken(encoder, dst),
      ]);

      const amount = CurrencyAmount.fromRawAmount(
        srcToken,
        srcAmount.toString()
      );

      const swapOptions = {
        type: SwapType.SWAP_ROUTER_02 as const,
        recipient: encoder.address,
        slippageTolerance: new Percent(50, 10000), // 0.5%
        deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      };

      // Check if there are preferred intermediate tokens for this source
      const intermediates =
        preferredIntermediateTokens[chainId]?.[getAddress(src)] ?? [];

      // Try direct route
      console.log(`(UniswapSmartOrderRouter) Finding best route...`);
      const directRoute = await router.route(
        amount,
        dstToken,
        TradeType.EXACT_INPUT,
        swapOptions
      );

      // Try routes through intermediate tokens
      const intermediateRoutes: {
        intermediate: Address;
        route1: SwapRoute;
        route2: SwapRoute;
        totalQuote: bigint;
      }[] = [];

      for (const intermediate of intermediates) {
        try {
          const intermediateToken = await this.getToken(encoder, intermediate);

          // Route 1: src -> intermediate
          const route1 = await router.route(
            amount,
            intermediateToken,
            TradeType.EXACT_INPUT,
            swapOptions
          );

          if (!route1) continue;

          // Route 2: intermediate -> dst
          const intermediateAmount = CurrencyAmount.fromRawAmount(
            intermediateToken,
            route1.quote.quotient.toString()
          );

          const route2 = await router.route(
            intermediateAmount,
            dstToken,
            TradeType.EXACT_INPUT,
            swapOptions
          );

          if (!route2) continue;

          const totalQuote = BigInt(route2.quote.quotient.toString());
          intermediateRoutes.push({
            intermediate,
            route1,
            route2,
            totalQuote,
          });

          console.log(
            `(UniswapSmartOrderRouter) Intermediate route via ${intermediateToken.symbol}:`,
            {
              path: `${srcToken.symbol} -> ${intermediateToken.symbol} -> ${dstToken.symbol}`,
              step1Quote: route1.quote.toExact(),
              step2Quote: route2.quote.toExact(),
              totalQuote: route2.quote.toExact(),
            }
          );
        } catch (error) {
          console.log(
            `(UniswapSmartOrderRouter) Failed to find route via ${intermediate}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      // Compare routes and pick the best one
      const directQuote = directRoute
        ? BigInt(directRoute.quote.quotient.toString())
        : 0n;
      const bestIntermediate = intermediateRoutes.reduce<
        (typeof intermediateRoutes)[0] | null
      >(
        (best, current) =>
          !best || current.totalQuote > best.totalQuote ? current : best,
        null
      );

      const useIntermediate =
        bestIntermediate && bestIntermediate.totalQuote > directQuote;

      if (useIntermediate && bestIntermediate) {
        const intermediateToken = await this.getToken(
          encoder,
          bestIntermediate.intermediate
        );
        console.log(
          `(UniswapSmartOrderRouter) Using intermediate route via ${intermediateToken.symbol} (${bestIntermediate.totalQuote} > ${directQuote})`
        );

        // Encode first swap: src -> intermediate
        const router1Address = bestIntermediate.route1.methodParameters
          ?.to as Address;
        encoder.erc20Approve(src, router1Address, srcAmount);
        encoder.pushCall(
          router1Address,
          BigInt(bestIntermediate.route1.methodParameters!.value),
          bestIntermediate.route1.methodParameters!.calldata as `0x${string}`
        );

        // Encode second swap: intermediate -> dst
        const intermediateAmount = BigInt(
          bestIntermediate.route1.quote.quotient.toString()
        );
        const router2Address = bestIntermediate.route2.methodParameters
          ?.to as Address;
        encoder.erc20Approve(
          bestIntermediate.intermediate,
          router2Address,
          intermediateAmount
        );
        encoder.pushCall(
          router2Address,
          BigInt(bestIntermediate.route2.methodParameters!.value),
          bestIntermediate.route2.methodParameters!.calldata as `0x${string}`
        );

        return {
          src: dst,
          dst: dst,
          srcAmount: bestIntermediate.totalQuote,
        };
      }

      // Use direct route
      if (!directRoute) {
        throw new Error("No route found");
      }

      console.log(`(UniswapSmartOrderRouter) Using direct route:`, {
        quote: directRoute.quote.toExact(),
        quoteGasAdjusted: directRoute.quoteGasAdjusted.toExact(),
        estimatedGasUsed: directRoute.estimatedGasUsed.toString(),
        protocols: directRoute.route.map((r) => r.protocol).join(" -> "),
        tokenPath: directRoute.route
          .flatMap((r) => r.tokenPath.map((t) => t.symbol))
          .join(" -> "),
      });

      // Approve the router to spend the source token
      const routerAddress = directRoute.methodParameters?.to as Address;
      encoder.erc20Approve(src, routerAddress, srcAmount);

      // Execute the swap
      if (!directRoute.methodParameters) {
        throw new Error("No method parameters returned from router");
      }

      encoder.pushCall(
        routerAddress,
        BigInt(directRoute.methodParameters.value),
        directRoute.methodParameters.calldata as `0x${string}`
      );

      // Return the updated state with the expected amount received
      return {
        src: dst,
        dst: dst,
        srcAmount: BigInt(directRoute.quote.quotient.toString()),
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
          ENV.UNISWAP_V3_SUBGRAPH_BEARER_TOKEN ?? undefined
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
