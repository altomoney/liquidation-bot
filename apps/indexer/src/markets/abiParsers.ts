import {
  AdaptiveCurveIrm,
  FixedRateIrm,
  type LiquidationConfiguration,
} from "@altomoney/sdk";

export function parseAdaptiveCurveIrmConfig(rawConfig: unknown) {
  if (typeof rawConfig !== "object" || rawConfig === null) {
    throw new Error("Invalid IRM config");
  }
  if (!Array.isArray(rawConfig) || rawConfig.length !== 6) {
    throw new Error("Invalid IRM config");
  }
  return AdaptiveCurveIrm.normalizeConfig({
    curveSteepness: rawConfig[0],
    adjustmentSpeed: rawConfig[1],
    targetUtilization: rawConfig[2],
    initialRateAtTarget: rawConfig[3],
    minRateAtTarget: rawConfig[4],
    maxRateAtTarget: rawConfig[5],
  });
}

export function parseAdaptiveCurveIrmState(rawState: unknown) {
  if (typeof rawState !== "object" || rawState === null) {
    throw new Error("Invalid IRM state");
  }
  if (!Array.isArray(rawState) || rawState.length !== 2) {
    throw new Error("Invalid IRM state");
  }
  return AdaptiveCurveIrm.normalizeState({
    rateAtTarget: rawState[0],
    lastUpdate: BigInt(rawState[1]),
  });
}

export function parseFixedRateIrmState(rawState: unknown) {
  if (typeof rawState !== "object" || rawState === null) {
    throw new Error("Invalid IRM state");
  }
  if (!Array.isArray(rawState) || rawState.length !== 2) {
    throw new Error("Invalid IRM state");
  }
  return FixedRateIrm.normalizeState({
    borrowRate: rawState[0],
    lastUpdate: BigInt(rawState[1]),
  });
}

export function parseLiquidationConfiguration(
  rawConfig: unknown,
): LiquidationConfiguration {
  if (typeof rawConfig !== "object" || rawConfig === null) {
    throw new Error("Invalid DlbDcfPriorityLiquidationEngine config");
  }
  if (!Array.isArray(rawConfig) || rawConfig.length !== 12) {
    throw new Error("Invalid DlbDcfPriorityLiquidationEngine config");
  }
  return {
    maxLiquidationLtv: rawConfig[0],
    dynamicBonusFeeStart: rawConfig[1],
    ltvForCompleteLiquidation: rawConfig[2],
    dynamicBonusFeeDecaySteepness: rawConfig[3],
    liquidationBaseFee: rawConfig[4],
    minPenaltyPercentage: rawConfig[5],
    protocolFeePercentage: rawConfig[6],
    isEnabledPriorityLiquidation: rawConfig[7],
    disablePriorityLiquidationAbovePositionLtv: rawConfig[8],
    priorityLiquidationGracePeriod: rawConfig[9],
    taggerLiquidationGracePeriod: rawConfig[10],
    liquidationWindowTag: rawConfig[11],
  };
}

export function marketTypeToString(marketTypeId: number) {
  if (marketTypeId === 0) {
    return "borrow";
  } else if (marketTypeId === 1) {
    return "mint";
  } else if (marketTypeId === 2) {
    return "dao_mint";
  } else {
    throw new Error(`Invalid market type: ${marketTypeId}`);
  }
}

export function irmTypeToString(irmTypeId: number) {
  if (irmTypeId === 0) {
    return "fixed";
  } else if (irmTypeId === 1) {
    return "adaptive";
  } else {
    throw new Error(`Invalid IRM type: ${irmTypeId}`);
  }
}

export function liquidationEngineTypeToString(
  liquidationEngineTypeId: number
): "DlbDcfPriorityLiquidationEngine" {
  if (liquidationEngineTypeId === 0) {
    return "DlbDcfPriorityLiquidationEngine";
  } else {
    throw new Error(
      `Invalid Liquidation Engine type: ${liquidationEngineTypeId}`
    );
  }
}
