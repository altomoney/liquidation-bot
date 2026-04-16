import { encodeFunctionData, isAddressEqual, type Address } from "viem";
import { readContract } from "viem/actions";

import { usmAbi } from "@/abis/usm";
import { usmSellAdapterAbi } from "@/abis/usmSellAdapter";
import type { LiquidationEncoder } from "@/utils/LiquidationEncoder";
import type { IndexerActiveUsmsResponse } from "../../utils/types";

type ActiveUsm = IndexerActiveUsmsResponse["activeUsms"][number];

export interface UsmSellQuote {
  maxAssetAmount: bigint;
  assetAmount: bigint;
  stableTokenAmount: bigint;
  grossStableTokenAmount: bigint;
  feeAmount: bigint;
}

export class UsmVenue {
  constructor(private readonly activeUsms: ActiveUsm[]) {}

  getCandidateUsms(stableToken: Address) {
    return this.activeUsms.filter(
      (usm) =>
        isAddressEqual(usm.stableToken, stableToken) &&
        usm.type === "permissionless" &&
        usm.isActive &&
        !usm.swapsFrozen &&
        usm.dusdConfig.minterStatus,
    );
  }

  async quoteSellAsset(
    encoder: LiquidationEncoder,
    usm: ActiveUsm,
    maxAssetAmount: bigint,
  ): Promise<UsmSellQuote> {
    const [assetAmount, stableTokenAmount, grossStableTokenAmount, feeAmount] =
      await readContract(encoder.client, {
        address: usm.address,
        abi: usmAbi,
        functionName: "getStableTokenAmountForSellAsset",
        args: [maxAssetAmount],
      });

    this.assertCanAccommodate(usm, assetAmount, grossStableTokenAmount);

    return {
      maxAssetAmount,
      assetAmount,
      stableTokenAmount,
      grossStableTokenAmount,
      feeAmount,
    };
  }

  encodeSellAsset(
    encoder: LiquidationEncoder,
    usm: ActiveUsm,
    quote: UsmSellQuote,
    usmSellAdapterAddress: Address,
    surplusRecipient?: Address,
  ) {
    encoder.erc20Approve(
      usm.underlyingAsset,
      usmSellAdapterAddress,
      quote.maxAssetAmount,
    );
    encoder.pushCall(
      usmSellAdapterAddress,
      0n,
      encodeFunctionData({
        abi: usmSellAdapterAbi,
        functionName: "sellAssetFromSenderBalance",
        args: [
          usm.underlyingAsset,
          usm.address,
          encoder.address,
          quote.maxAssetAmount,
        ],
      }),
    );

    if (surplusRecipient) {
      encoder.erc20Skim(usm.underlyingAsset, surplusRecipient);
    }

    return encoder;
  }

  private assertCanAccommodate(
    usm: ActiveUsm,
    assetAmount: bigint,
    grossStableTokenAmount: bigint,
  ) {
    if (!usm.isActive || usm.swapsFrozen || !usm.dusdConfig.minterStatus) {
      throw new Error(`USM ${usm.address} is not active for swaps`);
    }

    const newExposure = usm.currentExposure + assetAmount;
    const newMinted = usm.dusdConfig.currentlyMinted + grossStableTokenAmount;

    if (newExposure > usm.underlyingExposureCap) {
      throw new Error(
        `USM exposure cap exceeded: need ${assetAmount}, available ${
          usm.underlyingExposureCap - usm.currentExposure
        }`,
      );
    }

    if (newMinted > usm.dusdConfig.minterCeiling) {
      throw new Error(
        `USM minter ceiling exceeded: need ${grossStableTokenAmount}, available ${
          usm.dusdConfig.minterCeiling - usm.dusdConfig.currentlyMinted
        }`,
      );
    }
  }
}
