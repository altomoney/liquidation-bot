import { Address } from "viem";
import { LENDING_ORACLE_PRICE_PRECISION, Market } from "../market/Market";
import { PositionDb } from "../market/types";
import { AssetShareConversionMath } from "../math/AssetShareConversionMath";
import { wExp } from "../math/ExplLib";
import { FixedPointMath } from "../math/FixedPointMath";
import { ILiquidationEngine } from "./types";

export type LiquidationConfiguration = {
  maxLiquidationLtv: bigint;
  dynamicBonusFeeStart: bigint;
  ltvForCompleteLiquidation: bigint;
  dynamicBonusFeeDecaySteepness: bigint;
  liquidationBaseFee: bigint;
  minPenaltyPercentage: bigint;
  protocolFeePercentage: bigint;
  isEnabledPriorityLiquidation: boolean;
  disablePriorityLiquidationAbovePositionLtv: bigint;
  priorityLiquidationGracePeriod: number;
  taggerLiquidationGracePeriod: number;
  liquidationWindowTag: number;
};

export class DlbDcfPriorityLiquidationEngine implements ILiquidationEngine {
  private readonly liquidationConfiguration: LiquidationConfiguration;
  private readonly isPriorityLiquidator: boolean;
  private readonly market: Market;

  constructor(
    market: Market,
    liquidationConfiguration: LiquidationConfiguration,
    isPriorityLiquidator: boolean
  ) {
    this.liquidationConfiguration = liquidationConfiguration;
    this.isPriorityLiquidator = isPriorityLiquidator;
    this.market = market;
  }

  public seizableCollateralOfPosition(
    _position: PositionDb,
    liquidatorAddress: Address,
    additionalData?: undefined
  ): bigint {
    if (
      this.market.collateralPrice === 0n ||
      this._isSolventLiquidation(_position)
    ) {
      return 0n;
    }

    const position = {
      collateralAssets: _position.collateral,
      borrowShares: _position.borrowShares,
    };

    const collateralPrice = this.market.collateralPrice;

    const positionCollateralValue = FixedPointMath.divideWithRounding(
      position.collateralAssets,
      collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down"
    );

    const positionBorrowedAssets = AssetShareConversionMath.convertToAssetsUp(
      position.borrowShares,
      this.market.totalBorrow.assets,
      this.market.totalBorrow.shares
    );

    const currentLtv = FixedPointMath.divideWithPrecisionUp(
      positionBorrowedAssets,
      positionCollateralValue
    );

    const liquidationPercentage =
      this._calculateLiquidationPercentage(currentLtv);

    const liquidationFee =
      (this.isPriorityLiquidator
        ? 0n
        : this._calculateBonusFee(liquidationPercentage)) +
      this.liquidationConfiguration.liquidationBaseFee;

    const newLtv = this._calculateNewLtv(liquidationPercentage);

    const liquidatorBonusFee = FixedPointMath.multiplyWithPrecision(
      position.collateralAssets,
      liquidationFee
    );

    const protocolFee = FixedPointMath.divideWithRounding(
      liquidatorBonusFee,
      this.liquidationConfiguration.protocolFeePercentage,
      FixedPointMath.MATH_PRECISION,
      "Up"
    );

    const remainingCollateralAfterFee =
      position.collateralAssets - liquidatorBonusFee;

    const remainingCollateralAfterFeeInBorrowAssets =
      FixedPointMath.divideWithRounding(
        remainingCollateralAfterFee,
        collateralPrice,
        LENDING_ORACLE_PRICE_PRECISION,
        "Down"
      );

    let collateralToSellInBorrowAssets = FixedPointMath.divideWithPrecisionUp(
      positionBorrowedAssets -
        FixedPointMath.multiplyWithPrecision(
          remainingCollateralAfterFeeInBorrowAssets,
          newLtv
        ),
      FixedPointMath.MATH_PRECISION - newLtv
    );

    collateralToSellInBorrowAssets = FixedPointMath.min(
      collateralToSellInBorrowAssets,
      remainingCollateralAfterFeeInBorrowAssets
    );
    collateralToSellInBorrowAssets = FixedPointMath.min(
      collateralToSellInBorrowAssets,
      positionBorrowedAssets
    );

    const totalCollateralToTake =
      FixedPointMath.divideWithRounding(
        collateralToSellInBorrowAssets,
        LENDING_ORACLE_PRICE_PRECISION,
        collateralPrice,
        "Up"
      ) + liquidatorBonusFee;

    const collateralAmount =
      totalCollateralToTake > position.collateralAssets
        ? position.collateralAssets
        : totalCollateralToTake;

    const collateralAmountToSend = collateralAmount - protocolFee;

    return collateralAmountToSend;
  }

  private _isSolventLiquidation(position: PositionDb) {
    const collateralPrice = this.market.collateralPrice;
    const collateralValue = FixedPointMath.divideWithRounding(
      position.collateral,
      collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down"
    );

    const maxBorrowValue = FixedPointMath.multiplyWithPrecision(
      collateralValue,
      this.liquidationConfiguration.maxLiquidationLtv
    );

    const borrowValue = AssetShareConversionMath.convertToAssetsUp(
      position.borrowShares,
      this.market.totalBorrow.assets,
      this.market.totalBorrow.shares
    );

    return borrowValue == 0n || maxBorrowValue > borrowValue;
  }

  private _calculateLiquidationPercentage(currentLtv: bigint) {
    if (currentLtv >= this.liquidationConfiguration.ltvForCompleteLiquidation) {
      return FixedPointMath.MATH_PRECISION;
    } else {
      return FixedPointMath.divideWithPrecisionUp(
        currentLtv - this.liquidationConfiguration.maxLiquidationLtv,
        this.liquidationConfiguration.ltvForCompleteLiquidation -
          this.liquidationConfiguration.maxLiquidationLtv
      );
    }
  }

  private _calculateBonusFee(liquidationPercentage: bigint) {
    if (liquidationPercentage < FixedPointMath.MATH_PRECISION) {
      const exponent =
        (-BigInt(this.liquidationConfiguration.dynamicBonusFeeDecaySteepness) *
          liquidationPercentage) /
        FixedPointMath.MATH_PRECISION;
      return FixedPointMath.multiplyWithPrecision(
        this.liquidationConfiguration.dynamicBonusFeeStart,
        wExp(exponent)
      );
    } else {
      return 0n;
    }
  }

  private _calculateNewLtv(liquidationPercentage: bigint) {
    const liquidationPercentageAppliedPenalty =
      liquidationPercentage < this.liquidationConfiguration.minPenaltyPercentage
        ? this.liquidationConfiguration.minPenaltyPercentage
        : liquidationPercentage;
    return FixedPointMath.multiplyWithPrecision(
      this.market.maxLtv,
      FixedPointMath.MATH_PRECISION - liquidationPercentageAppliedPenalty
    );
  }

  public static configFromRawConfig(
    rawConfig:
      | [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          boolean,
          bigint,
          number,
          number,
          number
        ]
      | unknown
  ): LiquidationConfiguration {
    if (typeof rawConfig !== "object" || rawConfig === null) {
      throw new Error("Invalid DlbDcfPriorityLiquidationEngine config");
    }
    if (!Array.isArray(rawConfig) || rawConfig.length !== 12) {
      throw new Error("Invalid DlbDcfPriorityLiquidationEngine config");
    }

    // struct LiquidationConfiguration {
    //     0  uint256 maxLiquidationLtv;
    //     1  uint256 dynamicBonusFeeStart;
    //     2  uint256 ltvForCompleteLiquidation;
    //     3  uint256 dynamicBonusFeeDecaySteepness;
    //     4  uint256 liquidationBaseFee;
    //     5  uint256 minPenaltyPercentage;
    //     6  uint256 protocolFeePercentage;
    //     7  bool isEnabledPriorityLiquidation;
    //     8  uint256 disablePriorityLiquidationAbovePositionLtv;
    //     9  uint32 priorityLiquidationGracePeriod;
    //     10 uint32 taggerLiquidationGracePeriod;
    //     11 uint32 liquidationWindowTag;
    // }
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
}
