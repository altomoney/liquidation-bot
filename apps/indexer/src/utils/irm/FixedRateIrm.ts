import { FixedPointMath } from "../math/FixedPointMath";
import { _calculateCompoundInterest } from "./calculateCompoundInterest";
import { IIrm } from "./types";

export type FixedRateIrmState = {
  borrowRate: bigint;
  lastUpdate: bigint;
};

export class FixedRateIrm implements IIrm {
  private irmState: FixedRateIrmState;

  constructor(irmState: FixedRateIrmState) {
    this.irmState = irmState;
  }

  public updateInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint
  ) {
    const { interest, newBorrowRate } = this._accrueInterest(
      totalSupply,
      totalBorrowed,
      nowSeconds
    );

    this.irmState = {
      borrowRate: newBorrowRate,
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
    const interest = FixedPointMath.multiplyWithPrecision(
      totalBorrowed,
      _calculateCompoundInterest(
        this.irmState.borrowRate,
        nowSeconds - this.irmState.lastUpdate
      )
    );

    return {
      interest,
      newBorrowRate: this.irmState.borrowRate,
    };
  }

  public static stateFromRawState(
    rawState: [bigint, number] | unknown
  ): FixedRateIrmState {
    if (typeof rawState !== "object" || rawState === null) {
      throw new Error("Invalid IRM state");
    }
    if (!Array.isArray(rawState) || rawState.length !== 2) {
      throw new Error("Invalid IRM state");
    }
    return {
      borrowRate: rawState[0],
      lastUpdate: BigInt(rawState[1]),
    };
  }
}
