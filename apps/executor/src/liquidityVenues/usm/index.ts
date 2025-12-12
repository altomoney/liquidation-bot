import type { ExecutorEncoder } from "executooor-viem";
import { encodeFunctionData, type Address } from "viem";
import { readContract } from "viem/actions";

import { usmAbi } from "@/abis/usm";
import type { IndexerActiveUsmsResponse, ToConvert } from "../../utils/types";
import type { LiquidityVenue } from "../liquidityVenue";
import { UniswapSmartOrderRouterVenue } from "../uniswapSmartOrderRouter";

type ActiveUsm = IndexerActiveUsmsResponse["activeUsms"][number];

/**
 * USM (Unified Stablecoin Module) liquidity venue that:
 * 1. Swaps collateral token to USM's underlying asset using Uniswap Smart Order Router
 * 2. Calls sellAsset on USM to convert underlying asset to the final destination token
 */
export class UsmVenue implements LiquidityVenue {
  private activeUsms: ActiveUsm[];
  private uniswapVenue: UniswapSmartOrderRouterVenue;

  constructor(activeUsms: ActiveUsm[]) {
    this.activeUsms = activeUsms;
    this.uniswapVenue = new UniswapSmartOrderRouterVenue();
  }

  async supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    if (src === dst) return false;

    const usm = this.findViableUsm(dst);
    if (!usm) return false;

    // If src is already the underlying asset, no swap needed
    if (src === usm.underlyingAsset) return true;

    // Check if Uniswap can swap src to underlying asset
    return this.uniswapVenue.supportsRoute(encoder, src, usm.underlyingAsset);
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    const usm = this.findViableUsm(dst);
    if (!usm) {
      throw new Error(`No viable USM found for stable token ${dst}`);
    }

    const { underlyingAsset, address: usmAddress } = usm;
    let underlyingAmount = srcAmount;

    // If src is not the underlying asset, swap it via Uniswap first
    if (src !== underlyingAsset) {
      const swapResult = await this.uniswapVenue.convert(encoder, {
        src,
        dst: underlyingAsset,
        srcAmount,
      });
      underlyingAmount = swapResult.srcAmount;

      if (underlyingAmount === 0n) {
        throw new Error("No underlying asset received from swap");
      }
    }

    // Get the exact stable token output from the contract
    const [assetAmount, , grossAmount] = await readContract(encoder.client, {
      address: usmAddress,
      abi: usmAbi,
      functionName: "getStableTokenAmountForSellAsset",
      args: [underlyingAmount],
    });

    // Verify USM can accommodate this amount
    this.assertCanAccommodate(usm, assetAmount, grossAmount);

    // Approve and call sellAsset on USM
    encoder.erc20Approve(underlyingAsset, usmAddress, underlyingAmount);
    encoder.pushCall(
      usmAddress,
      0n,
      encodeFunctionData({
        abi: usmAbi,
        functionName: "sellAsset",
        args: [underlyingAmount, encoder.address],
      })
    );

    return { src: dst, dst, srcAmount: 0n };
  }

  /**
   * Check if USM can accommodate the sell after execution:
   * - currentExposure + assetAmount <= exposureCap
   * - currentlyMinted + grossAmount <= minterCeiling
   */
  private assertCanAccommodate(
    usm: ActiveUsm,
    assetAmount: bigint,
    grossAmount: bigint
  ): void {
    const newExposure = usm.currentExposure + assetAmount;
    if (newExposure > usm.underlyingExposureCap) {
      throw new Error(
        `USM exposure cap exceeded: ${newExposure} > ${usm.underlyingExposureCap}`
      );
    }

    const newMinted = usm.dusdConfig.currentlyMinted + grossAmount;
    if (newMinted > usm.dusdConfig.minterCeiling) {
      throw new Error(
        `USM minter ceiling exceeded: ${newMinted} > ${usm.dusdConfig.minterCeiling}`
      );
    }
  }

  /**
   * Find a USM that:
   * - Has the given stable token
   * - Is active
   * - Has available minting capacity (minterCeiling > currentlyMinted)
   * - Has available exposure capacity (exposureCap > currentExposure)
   */
  private findViableUsm(stableToken: Address): ActiveUsm | undefined {
    return this.activeUsms.find(
      (usm) =>
        usm.stableToken === stableToken &&
        usm.isActive &&
        usm.underlyingExposureCap > usm.currentExposure &&
        usm.dusdConfig.minterCeiling > usm.dusdConfig.currentlyMinted
    );
  }
}
