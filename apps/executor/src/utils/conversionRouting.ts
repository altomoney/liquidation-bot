import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { isAddressEqual } from "viem";

import type { UsmMode } from "@/config";
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
  usmMode?: UsmMode;
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

export async function planBestConversionRoute({
  executorAddress,
  usmSellAdapterAddress,
  client,
  liquidityVenues,
  toConvert,
  activeUsms,
  usmMode = "never",
  surplusRecipient,
}: PlanBestConversionRouteParams): Promise<ConversionRouteResult> {
  const logTag = `[planRoute ${toConvert.src.slice(0, 8)}→${toConvert.dst.slice(0, 8)}]`;
  const canTryUsm =
    usmMode !== "never" &&
    activeUsms?.length &&
    !isAddressEqual(toConvert.src, toConvert.dst);
  const candidateUsms = canTryUsm
    ? new UsmVenue(activeUsms).getCandidateUsms(toConvert.dst)
    : [];

  if (usmMode === "always" && candidateUsms.length > 0) {
    console.log(
      `${logTag} USM mode=always, trying ${candidateUsms.length} USM candidate(s) before direct`,
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
      console.log(`${logTag} USM mode=always → using USM fallback`);
      return usmAttempt.result;
    }

    console.log(
      `${logTag} USM mode=always had no successful fallback, trying direct`,
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

  if (usmMode === "never" || candidateUsms.length === 0) {
    if (usmMode !== "never" && canTryUsm && candidateUsms.length === 0) {
      console.log(`${logTag} no candidate USMs for dst, keeping direct`);
    }
    return directResult;
  }

  const directOutput = getOutputAmount(directResult);
  console.log(
    `${logTag} direct output=${directOutput?.toString() ?? "N/A"}, trying ${candidateUsms.length} USM candidate(s)`,
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
    if (!directResult.success) {
      console.log(`${logTag} direct failed → using USM fallback`);
      return usmAttempt.result;
    }

    const fallbackOutput = getOutputAmount(usmAttempt.result);
    if (
      directOutput !== undefined &&
      fallbackOutput !== undefined &&
      fallbackOutput > directOutput
    ) {
      console.log(
        `${logTag} USM wins: ${fallbackOutput} > direct ${directOutput}`,
      );
      return usmAttempt.result;
    }

    console.log(
      `${logTag} keeping direct route (usm=${fallbackOutput?.toString() ?? "N/A"}, direct=${directOutput?.toString() ?? "N/A"})`,
    );
    return directResult;
  }

  if (!directResult.success && usmAttempt.errors.length > 0) {
    directResult.errors.push(...usmAttempt.errors);
  }

  console.log(`${logTag} keeping direct route`);
  return directResult;
}
