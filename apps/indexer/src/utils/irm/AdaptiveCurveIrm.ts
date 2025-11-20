import { wExp } from "../math/ExplLib";
import { FixedPointMath } from "../math/FixedPointMath";
import { _calculateCompoundInterest } from "./calculateCompoundInterest";
import { IIrm } from "./types";

export type AdaptiveCurveIrmConfig = {
  curveSteepness: bigint;
  adjustmentSpeed: bigint;
  targetUtilization: bigint;
  initialRateAtTarget: bigint;
  minRateAtTarget: bigint;
  maxRateAtTarget: bigint;
};

export type AdaptiveCurveIrmState = {
  lastUpdate: bigint;
  rateAtTarget: bigint;
};

export class AdaptiveCurveIrm implements IIrm {
  private readonly irmConfig: AdaptiveCurveIrmConfig;
  private irmState: AdaptiveCurveIrmState;

  constructor(
    irmConfig: AdaptiveCurveIrmConfig,
    irmState: AdaptiveCurveIrmState
  ) {
    this.irmConfig = irmConfig;
    this.irmState = irmState;
  }

  public updateInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint
  ) {
    const { interest, newBorrowRate, rateAtTarget } = this._accrueInterest(
      totalSupply,
      totalBorrowed,
      nowSeconds
    );

    this.irmState = {
      rateAtTarget: rateAtTarget,
      lastUpdate: nowSeconds,
    };

    return {
      interest,
      newBorrowRate,
    };
  }

  private _accrueInterest(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint
  ) {
    const { avgRate, rateAtTarget } = this._computeInterestRate(
      totalSupply,
      totalBorrowed,
      nowSeconds
    );

    const interest = FixedPointMath.multiplyWithPrecision(
      totalBorrowed,
      _calculateCompoundInterest(
        avgRate,
        this._getCurrentTimeElapsed(nowSeconds)
      )
    );

    return {
      interest,
      newBorrowRate: avgRate,
      rateAtTarget,
    };
  }

  private _computeInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint
  ) {
    const utilization =
      totalSupply > 0n
        ? FixedPointMath.divideWithPrecisionDown(totalBorrowed, totalSupply)
        : 0n;

    const errNormFactor =
      utilization > this.irmConfig.targetUtilization
        ? FixedPointMath.MATH_PRECISION - this.irmConfig.targetUtilization
        : this.irmConfig.targetUtilization;

    const err = FixedPointMath.divideWithPrecisionDown(
      utilization - this.irmConfig.targetUtilization,
      errNormFactor
    );

    const startRateAtTarget = this.irmState.rateAtTarget;

    let avgRateAtTarget: bigint;
    let endRateAtTarget: bigint;

    if (startRateAtTarget === 0n) {
      avgRateAtTarget = this.irmConfig.initialRateAtTarget;
      endRateAtTarget = this.irmConfig.initialRateAtTarget;
    } else {
      const speed = FixedPointMath.multiplyWithPrecision(
        this.irmConfig.adjustmentSpeed,
        err
      );

      const elapsed = this._getCurrentTimeElapsed(nowSeconds);
      const linearAdaptation = speed * elapsed;

      if (linearAdaptation === 0n) {
        avgRateAtTarget = startRateAtTarget;
        endRateAtTarget = startRateAtTarget;
      } else {
        endRateAtTarget = this._newRateAtTarget(
          startRateAtTarget,
          linearAdaptation
        );
        const midRateAtTarget = this._newRateAtTarget(
          startRateAtTarget,
          linearAdaptation / 2n
        );

        avgRateAtTarget =
          (startRateAtTarget + endRateAtTarget + 2n * midRateAtTarget) / 4n;
      }
    }

    return {
      avgRate: this._curve(avgRateAtTarget, err),
      rateAtTarget: endRateAtTarget,
    };
  }

  private _getCurrentTimeElapsed(nowSeconds: bigint) {
    return nowSeconds - this.irmState.lastUpdate;
  }

  private _curve(rateAtTarget: bigint, err: bigint) {
    const coeff =
      err < 0
        ? FixedPointMath.MATH_PRECISION -
          FixedPointMath.divideWithPrecisionDown(
            FixedPointMath.MATH_PRECISION,
            this.irmConfig.curveSteepness
          )
        : this.irmConfig.curveSteepness - FixedPointMath.MATH_PRECISION;

    return FixedPointMath.multiplyWithPrecision(
      FixedPointMath.multiplyWithPrecision(coeff, err) +
        FixedPointMath.MATH_PRECISION,
      rateAtTarget
    );
  }

  private _newRateAtTarget(
    startRateAtTarget: bigint,
    linearAdaptation: bigint
  ) {
    return FixedPointMath.min(
      FixedPointMath.max(
        FixedPointMath.multiplyWithPrecision(
          startRateAtTarget,
          wExp(linearAdaptation)
        ),
        this.irmConfig.minRateAtTarget
      ),
      this.irmConfig.maxRateAtTarget
    );
  }

  public static configFromRawConfig(
    rawConfig: [bigint, bigint, bigint, bigint, bigint, bigint] | unknown
  ): AdaptiveCurveIrmConfig {
    if (typeof rawConfig !== "object" || rawConfig === null) {
      throw new Error("Invalid IRM config");
    }
    if (!Array.isArray(rawConfig) || rawConfig.length !== 6) {
      throw new Error("Invalid IRM config");
    }
    /**
     * {
            int256 curveSteepness;
            int256 adjustmentSpeed;
            int256 targetUtilization;
            int256 initialRateAtTarget;
            int256 minRateAtTarget;
            int256 maxRateAtTarget;
        }
    */
    return {
      curveSteepness: rawConfig[0],
      adjustmentSpeed: rawConfig[1],
      targetUtilization: rawConfig[2],
      initialRateAtTarget: rawConfig[3],
      minRateAtTarget: rawConfig[4],
      maxRateAtTarget: rawConfig[5],
    };
  }

  public static stateFromRawState(
    rawState: [bigint, number] | unknown
  ): AdaptiveCurveIrmState {
    if (typeof rawState !== "object" || rawState === null) {
      throw new Error("Invalid IRM state");
    }
    if (!Array.isArray(rawState) || rawState.length !== 2) {
      throw new Error("Invalid IRM state");
    }
    return {
      rateAtTarget: rawState[0],
      lastUpdate: BigInt(rawState[1]),
    };
  }
}
