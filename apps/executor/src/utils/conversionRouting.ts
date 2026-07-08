import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { isAddressEqual, maxUint256 } from "viem";

import type { StableRouteMode } from "@/config";
import type { LiquidityVenue } from "@/liquidity-venues/types";
import { UsmVenue } from "@/liquidity-venues/usm";
import { LiquidationEncoder } from "./LiquidationEncoder";
import type {
  ConversionRouteResult,
  IndexerActiveUsmsResponse,
  ToConvert,
} from "./types";

type ActiveUsm = IndexerActiveUsmsResponse["activeUsms"][number];

interface ExecuteVenuePassParams {
  encoder: LiquidationEncoder;
  liquidityVenues: LiquidityVenue[];
  toConvert: ToConvert;
}

interface PlanBestConversionRouteParams {
  executorAddress: Address;
  usmSellAdapterAddress: Address;
  client: WalletClient<Transport, Chain, Account>;
  liquidityVenues: LiquidityVenue[];
  toConvert: ToConvert;
  activeUsms?: ActiveUsm[];
  stableRouteMode?: StableRouteMode;
  surplusRecipient?: Address;
}

interface PlanPeripheryUsmRouteParams {
  executorAddress: Address;
  liquidationPeripheryAddress: Address;
  client: WalletClient<Transport, Chain, Account>;
  liquidityVenues: LiquidityVenue[];
  toConvert: ToConvert;
  activeUsms?: ActiveUsm[];
  surplusRecipient?: Address;
}

async function tryUsmFallbackRoutes({
  executorAddress,
  usmSellAdapterAddress,
  client,
  liquidityVenues,
  toConvert,
  candidateUsms,
  surplusRecipient,
  logTag,
}: {
  executorAddress: Address;
  usmSellAdapterAddress: Address;
  client: WalletClient<Transport, Chain, Account>;
  liquidityVenues: LiquidityVenue[];
  toConvert: ToConvert;
  candidateUsms: ActiveUsm[];
  surplusRecipient?: Address;
  logTag: string;
}): Promise<{
  result?: ConversionRouteResult;
  errors: string[];
}> {
  const usmVenue = new UsmVenue(candidateUsms);
  const fallbackErrors: string[] = [];

  for (const [i, usm] of candidateUsms.entries()) {
    try {
      console.log(
        `${logTag} USM[${i}] ${usm.address.slice(0, 10)} → underlying ${usm.underlyingAsset.slice(0, 10)}: venue pass...`,
      );
      const fallbackRoute = await executeVenuePass({
        encoder: new LiquidationEncoder(executorAddress, client),
        liquidityVenues,
        toConvert: {
          ...toConvert,
          dst: usm.underlyingAsset,
        },
      });

      if (!fallbackRoute.success) {
        const msg = `USM ${usm.address}: ${fallbackRoute.errors.join(" | ") || "no route to underlying asset"}`;
        console.log(`${logTag} USM[${i}] venue pass failed: ${msg}`);
        fallbackErrors.push(msg);
        continue;
      }

      const underlyingAmount = getOutputAmount(fallbackRoute);
      console.log(
        `${logTag} USM[${i}] venue pass OK via [${fallbackRoute.path.join(" → ")}], underlying=${underlyingAmount?.toString() ?? "N/A"}`,
      );

      if (underlyingAmount === undefined || underlyingAmount <= 0n) {
        fallbackErrors.push(
          `USM ${usm.address}: missing quoted output for ${usm.underlyingAsset}`,
        );
        continue;
      }

      const fallbackEncoder = new LiquidationEncoder(executorAddress, client);
      fallbackEncoder.appendEncodedCalls(fallbackRoute.calls);

      console.log(
        `${logTag} USM[${i}] quoting sellAsset for ${underlyingAmount}...`,
      );
      const usmQuote = await usmVenue.quoteSellAsset(
        fallbackEncoder,
        usm,
        underlyingAmount,
      );
      console.log(
        `${logTag} USM[${i}] quote: stableOut=${usmQuote.stableTokenAmount} fee=${usmQuote.feeAmount}`,
      );

      if (usmQuote.assetAmount <= 0n || usmQuote.stableTokenAmount <= 0n) {
        fallbackErrors.push(`USM ${usm.address}: quote returned zero output`);
        continue;
      }

      usmVenue.encodeSellAsset(
        fallbackEncoder,
        usm,
        usmQuote,
        usmSellAdapterAddress,
        surplusRecipient,
      );

      return {
        result: {
          success: true,
          toConvert: {
            src: toConvert.dst,
            dst: toConvert.dst,
            srcAmount: usmQuote.stableTokenAmount,
          },
          path: [...fallbackRoute.path, "UsmVenue"],
          errors: fallbackRoute.errors,
          calls: fallbackEncoder.flush(),
        },
        errors: fallbackErrors,
      };
    } catch (error) {
      const msg = `USM ${usm.address}: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`${logTag} USM[${i}] error: ${msg}`);
      fallbackErrors.push(msg);
    }
  }

  return { errors: fallbackErrors };
}

function getOutputAmount(result: ConversionRouteResult): bigint | undefined {
  if (
    result.success &&
    isAddressEqual(result.toConvert.src, result.toConvert.dst) &&
    result.toConvert.srcAmount > 0n
  ) {
    return result.toConvert.srcAmount;
  }

  return undefined;
}

async function executeVenuePass({
  encoder,
  liquidityVenues,
  toConvert: initialToConvert,
}: ExecuteVenuePassParams): Promise<ConversionRouteResult> {
  const errors: string[] = [];
  const path: string[] = [];
  let toConvert = initialToConvert;

  if (isAddressEqual(toConvert.src, toConvert.dst)) {
    return {
      success: true,
      toConvert,
      path,
      errors,
      calls: encoder.flush(),
    };
  }

  for (const venue of liquidityVenues) {
    try {
      if (!(await venue.supportsRoute(encoder, toConvert.src, toConvert.dst))) {
        continue;
      }

      const nextToConvert = await venue.convert(encoder, toConvert);
      const progressed =
        !isAddressEqual(nextToConvert.src, toConvert.src) ||
        !isAddressEqual(nextToConvert.dst, toConvert.dst) ||
        nextToConvert.srcAmount !== toConvert.srcAmount;

      if (
        !progressed &&
        !isAddressEqual(nextToConvert.src, nextToConvert.dst)
      ) {
        errors.push(
          `${venue.constructor.name}: supportsRoute returned true but convert made no progress`,
        );
      }

      if (progressed || isAddressEqual(nextToConvert.src, nextToConvert.dst)) {
        path.push(venue.constructor.name);
      }

      toConvert = nextToConvert;

      if (isAddressEqual(toConvert.src, toConvert.dst)) {
        return {
          success: true,
          toConvert,
          path,
          errors,
          calls: encoder.flush(),
        };
      }
    } catch (error) {
      errors.push(
        `${venue.constructor.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    success: false,
    toConvert,
    path,
    errors,
    calls: encoder.flush(),
  };
}

export async function planPeripheryUsmRoute({
  executorAddress,
  liquidationPeripheryAddress,
  client,
  liquidityVenues,
  toConvert,
  activeUsms,
  surplusRecipient,
}: PlanPeripheryUsmRouteParams): Promise<
  ConversionRouteResult & { usm?: ActiveUsm }
> {
  const logTag = `[planPeriphery ${toConvert.src.slice(0, 8)}→${toConvert.dst.slice(0, 8)}]`;
  const candidateUsms = activeUsms?.length
    ? new UsmVenue(activeUsms).getPeripheryCandidateUsms(toConvert.dst)
    : [];
  const errors: string[] = [];

  if (candidateUsms.length === 0) {
    return {
      success: false,
      toConvert,
      path: [],
      errors: ["No advanced-permissions USM candidates for liquidation periphery"],
      calls: [],
    };
  }

  for (const [i, usm] of candidateUsms.entries()) {
    try {
      console.log(
        `${logTag} USM[${i}] ${usm.address.slice(0, 10)} → underlying ${usm.underlyingAsset.slice(0, 10)}: callback venue pass...`,
      );

      const callbackRoute = await executeVenuePass({
        encoder: new LiquidationEncoder(executorAddress, client),
        liquidityVenues,
        toConvert: {
          ...toConvert,
          dst: usm.underlyingAsset,
        },
      });

      if (!callbackRoute.success) {
        const msg = `USM ${usm.address}: ${callbackRoute.errors.join(" | ") || "no callback route to underlying asset"}`;
        console.log(`${logTag} USM[${i}] callback venue pass failed: ${msg}`);
        errors.push(msg);
        continue;
      }

      const callbackEncoder = new LiquidationEncoder(executorAddress, client);
      callbackEncoder.appendEncodedCalls(callbackRoute.calls);
      callbackEncoder.erc20Approve(
        usm.underlyingAsset,
        liquidationPeripheryAddress,
        maxUint256,
      );

      if (
        surplusRecipient &&
        !isAddressEqual(toConvert.src, usm.underlyingAsset)
      ) {
        callbackEncoder.erc20Skim(toConvert.src, surplusRecipient);
      }

      console.log(
        `${logTag} USM[${i}] callback route OK via [${callbackRoute.path.join(" → ")}]`,
      );

      return {
        success: true,
        toConvert: {
          src: toConvert.dst,
          dst: toConvert.dst,
          srcAmount: 0n,
        },
        path: [...callbackRoute.path, "LiquidationPeriphery"],
        errors: callbackRoute.errors,
        calls: callbackEncoder.flush(),
        usm,
      };
    } catch (error) {
      const msg = `USM ${usm.address}: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`${logTag} USM[${i}] error: ${msg}`);
      errors.push(msg);
    }
  }

  return {
    success: false,
    toConvert,
    path: [],
    errors,
    calls: [],
  };
}

export async function planBestConversionRoute({
  executorAddress,
  usmSellAdapterAddress,
  client,
  liquidityVenues,
  toConvert,
  activeUsms,
  stableRouteMode = "swap_only",
  surplusRecipient,
}: PlanBestConversionRouteParams): Promise<ConversionRouteResult> {
  const logTag = `[planRoute ${toConvert.src.slice(0, 8)}→${toConvert.dst.slice(0, 8)}]`;
  const canTryUsm =
    stableRouteMode === "public_usm_then_swap" &&
    activeUsms?.length &&
    !isAddressEqual(toConvert.src, toConvert.dst);
  const candidateUsms = canTryUsm
    ? new UsmVenue(activeUsms).getCandidateUsms(toConvert.dst)
    : [];

  if (candidateUsms.length > 0) {
    console.log(
      `${logTag} public USM mode, trying ${candidateUsms.length} USM candidate(s) before direct`,
    );
    const usmAttempt = await tryUsmFallbackRoutes({
      executorAddress,
      usmSellAdapterAddress,
      client,
      liquidityVenues,
      toConvert,
      candidateUsms,
      surplusRecipient,
      logTag,
    });

    if (usmAttempt.result) {
      console.log(`${logTag} using public USM route`);
      return usmAttempt.result;
    }

    console.log(
      `${logTag} public USM route failed, trying direct`,
    );
  }

  console.log(`${logTag} direct pass starting...`);
  const directResult = await executeVenuePass({
    encoder: new LiquidationEncoder(executorAddress, client),
    liquidityVenues,
    toConvert,
  });
  console.log(
    `${logTag} direct pass ${directResult.success ? "OK" : "FAIL"} via [${directResult.path.join(" → ")}]`,
  );

  if (candidateUsms.length === 0) {
    if (canTryUsm) {
      console.log(`${logTag} no public USM candidates for dst, keeping direct`);
    }
    return directResult;
  }

  console.log(`${logTag} keeping direct route`);
  return directResult;
}
