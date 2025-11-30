import type { ExecutorEncoder } from "executooor-viem";
import { encodeFunctionData, type Address } from "viem";
import { readContract } from "viem/actions";

import { usmAbi } from "@/abis/usm";
import type { ToConvert } from "../../utils/types";
import type { LiquidityVenue } from "../liquidityVenue";
import { UniswapSmartOrderRouterVenue } from "../uniswapSmartOrderRouter";

export interface UsmVenueConfig {
  usmAddresses: Address[];
}

/**
 * USM (Unified Stablecoin Module) liquidity venue that:
 * 1. Swaps collateral token to USM's underlying asset using Uniswap Smart Order Router
 * 2. Calls sellAsset on USM to convert underlying asset to the final destination token
 */
export class UsmVenue implements LiquidityVenue {
  private usmAddresses: Address[];
  private underlyingAssets: Map<Address, Address> = new Map();
  private stableTokens: Map<Address, Address> = new Map();
  private uniswapVenue: UniswapSmartOrderRouterVenue;

  constructor(config: UsmVenueConfig) {
    this.usmAddresses = config.usmAddresses;
    this.uniswapVenue = new UniswapSmartOrderRouterVenue();
  }

  /**
   * Check if this venue can handle the route.
   * It can if:
   * 1. There's a USM whose stable token matches the dst
   * 2. Uniswap can swap src to USM's underlying asset
   */
  async supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    console.log(`(USM) Checking route`, { src, dst });
    if (src === dst) return false;

    try {
      // Find a USM that has dst as its stable token
      const usm = await this.findUsmForStableToken(encoder, dst);
      if (!usm) {
        console.log(`(USM) No USM found with stable token ${dst}`);
        return false;
      }

      // Get the underlying asset for this USM
      const underlyingAsset = await this.getUnderlyingAsset(encoder, usm);
      if (!underlyingAsset) {
        console.log(`(USM) No underlying asset found for USM ${usm}`);
        return false;
      }

      // Check if src is already the underlying asset
      if (src === underlyingAsset) {
        console.log(
          `(USM) Source is already underlying asset, route supported`
        );
        return true;
      }

      // Check if Uniswap can swap src to underlying asset
      const canSwap = await this.uniswapVenue.supportsRoute(
        encoder,
        src,
        underlyingAsset
      );

      if (canSwap) {
        console.log(`(USM) Route supported via Uniswap -> USM`);
      } else {
        console.log(`(USM) Uniswap cannot swap ${src} to ${underlyingAsset}`);
      }

      return canSwap;
    } catch (error) {
      console.error(
        `(USM) Error checking route:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Convert collateral to loan token via:
   * 1. Swap src to USM's underlying asset using Uniswap (if needed)
   * 2. Call sellAsset on USM to convert underlying to stable token
   */
  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    console.log(`(USM) Converting`, {
      src,
      dst,
      srcAmount: srcAmount.toString(),
    });

    try {
      // Find the USM for the destination token
      const usm = await this.findUsmForStableToken(encoder, dst);
      if (!usm) {
        throw new Error(`No USM found with stable token ${dst}`);
      }

      const underlyingAsset = await this.getUnderlyingAsset(encoder, usm);
      if (!underlyingAsset) {
        throw new Error(`No underlying asset found for USM ${usm}`);
      }

      let underlyingAmount = srcAmount;

      // Step 1: If src is not the underlying asset, swap it via Uniswap
      if (src !== underlyingAsset) {
        console.log(
          `(USM) Step 1: Swapping ${src} to ${underlyingAsset} via Uniswap`
        );

        // Execute the swap and get the expected output amount
        const swapResult = await this.uniswapVenue.convert(encoder, {
          src,
          dst: underlyingAsset,
          srcAmount,
        });

        // Use the amount returned by the swap (expected output amount)
        underlyingAmount = swapResult.srcAmount;

        console.log(
          `(USM) Swap completed, expected to receive: ${underlyingAmount.toString()} of underlying asset`
        );

        if (underlyingAmount === 0n) {
          throw new Error("No underlying asset expected from swap");
        }
      }

      // Step 2: Call sellAsset on USM to convert underlying to stable token
      console.log(
        `(USM) Step 2: Calling sellAsset on USM ${usm} with underlying asset ${underlyingAsset}`
      );

      // Approve USM to spend the underlying asset
      encoder.erc20Approve(underlyingAsset, usm, underlyingAmount);

      // Call sellAsset(maxAmount, receiver, onBehalf)
      // maxAmount: maximum amount of underlying asset to sell
      // receiver: address to receive the stable tokens
      // onBehalf: address on whose behalf the operation is performed
      encoder.pushCall(
        usm,
        0n,
        encodeFunctionData({
          abi: usmAbi,
          functionName: "sellAsset",
          args: [
            underlyingAmount, // maxAmount - use all underlying we have
            encoder.address, // receiver - the executor
            encoder.address, // onBehalf - the executor
          ],
        })
      );

      console.log(`(USM) Conversion completed successfully`);

      // Return the updated state
      return {
        src: dst,
        dst: dst,
        srcAmount: 0n, // Amount is now in dst token
      };
    } catch (error) {
      throw new Error(
        `(USM) Error converting: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Find a USM that has the given stable token
   */
  private async findUsmForStableToken(
    encoder: ExecutorEncoder,
    stableToken: Address
  ): Promise<Address | null> {
    for (const usmAddress of this.usmAddresses) {
      try {
        // Check if we already cached this USM's stable token
        if (this.stableTokens.has(usmAddress)) {
          if (this.stableTokens.get(usmAddress) === stableToken) {
            return usmAddress;
          }
          continue;
        }

        // Fetch and cache the stable token
        const usmStableToken = await readContract(encoder.client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "STABLE_TOKEN",
        });

        this.stableTokens.set(usmAddress, usmStableToken);

        if (usmStableToken === stableToken) {
          return usmAddress;
        }
      } catch (error) {
        console.warn(
          `(USM) Error reading stable token for ${usmAddress}:`,
          error instanceof Error ? error.message : String(error)
        );
        continue;
      }
    }

    return null;
  }

  /**
   * Get the underlying asset for a USM
   */
  private async getUnderlyingAsset(
    encoder: ExecutorEncoder,
    usmAddress: Address
  ): Promise<Address | null> {
    // Check cache first
    if (this.underlyingAssets.has(usmAddress)) {
      return this.underlyingAssets.get(usmAddress)!;
    }

    try {
      const underlyingAsset = await readContract(encoder.client, {
        address: usmAddress,
        abi: usmAbi,
        functionName: "UNDERLYING_ASSET",
      });

      this.underlyingAssets.set(usmAddress, underlyingAsset);
      return underlyingAsset;
    } catch (error) {
      console.error(
        `(USM) Error reading underlying asset for ${usmAddress}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}
