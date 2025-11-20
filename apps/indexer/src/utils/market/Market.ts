import { IIrm } from "../irm/types";
import { AssetShareConversionMath } from "../math/AssetShareConversionMath";
import { wExp } from "../math/ExplLib";
import { FixedPointMath } from "../math/FixedPointMath";
import { MarketDb, PositionDb } from "./types";

const LENDING_ORACLE_PRICE_PRECISION = 10n ** 36n;

export class Market {
  private readonly market: MarketDb;
  private readonly irm?: IIrm;
  private readonly price: bigint;

  constructor(market: MarketDb, price: bigint, irm?: IIrm) {
    this.market = market;
    this.price = price;
    this.irm = irm;
  }

  public accrueInterest(nowSeconds: bigint) {
    if (this.irm) {
      const { interest } = this.irm.updateInterestRate(
        this.market.totalSupplyAssets,
        this.market.totalBorrowAssets,
        nowSeconds
      );
      this.market.totalBorrowAssets += interest;
      if (this.market.type === "borrow") {
        this.market.totalSupplyAssets += interest;
      }
    }

    return this;
  }

  public get totalSupply() {
    return {
      assets: this.market.totalSupplyAssets,
      shares: this.market.totalSupplyShares,
    };
  }

  public get totalBorrow() {
    return {
      assets: this.market.totalBorrowAssets,
      shares: this.market.totalBorrowShares,
    };
  }

  public seizableCollateralOfPosition(
    _position: PositionDb,
    isPriorityLiquidator: boolean
  ) {
    if (this.price === 0n || this._isSolventLiquidation(_position)) {
      return 0n;
    }

    const position = {
      collateralAssets: _position.collateral,
      borrowShares: _position.borrowShares,
    };

    const collateralPrice = this.price;

    const positionCollateralValue = FixedPointMath.divideWithRounding(
      position.collateralAssets,
      collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down"
    );

    const positionBorrowedAssets = AssetShareConversionMath.convertToAssetsUp(
      position.borrowShares,
      this.market.totalBorrowAssets,
      this.market.totalBorrowShares
    );

    const currentLtv = FixedPointMath.divideWithPrecisionUp(
      positionBorrowedAssets,
      positionCollateralValue
    );

    const liquidationPercentage =
      this._calculateLiquidationPercentage(currentLtv);

    const liquidationFee =
      (isPriorityLiquidator
        ? 0n
        : this._calculateBonusFee(liquidationPercentage)) +
      this.market.liquidationBaseFee;

    const newLtv = this._calculateNewLtv(liquidationPercentage);

    const liquidatorBonusFee = FixedPointMath.multiplyWithPrecision(
      position.collateralAssets,
      liquidationFee
    );

    const protocolFee = FixedPointMath.divideWithRounding(
      liquidatorBonusFee,
      this.market.protocolFeePercentage,
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
    const collateralPrice = this.price;
    const collateralValue = FixedPointMath.divideWithRounding(
      position.collateral,
      collateralPrice,
      LENDING_ORACLE_PRICE_PRECISION,
      "Down"
    );

    const maxBorrowValue = FixedPointMath.multiplyWithPrecision(
      collateralValue,
      this.market.lltv
    );

    const borrowValue = AssetShareConversionMath.convertToAssetsUp(
      position.borrowShares,
      this.market.totalBorrowAssets,
      this.market.totalBorrowShares
    );

    return borrowValue == 0n || maxBorrowValue > borrowValue;
  }

  private _calculateLiquidationPercentage(currentLtv: bigint) {
    if (currentLtv >= this.market.tLltv) {
      return FixedPointMath.MATH_PRECISION;
    } else {
      return FixedPointMath.divideWithPrecisionUp(
        currentLtv - this.market.lltv,
        this.market.tLltv - this.market.lltv
      );
    }
  }

  private _calculateBonusFee(liquidationPercentage: bigint) {
    if (liquidationPercentage < FixedPointMath.MATH_PRECISION) {
      const exponent =
        (-BigInt(this.market.dynamicBonusFeeDecaySteepness) *
          liquidationPercentage) /
        FixedPointMath.MATH_PRECISION;
      return FixedPointMath.multiplyWithPrecision(
        this.market.dynamicBonusFeeStart,
        wExp(exponent)
      );
    } else {
      return 0n;
    }
  }

  private _calculateNewLtv(liquidationPercentage: bigint) {
    const liquidationPercentageAppliedPenalty =
      liquidationPercentage < this.market.minPenaltyPercentage
        ? this.market.minPenaltyPercentage
        : liquidationPercentage;
    return FixedPointMath.multiplyWithPrecision(
      this.market.ltv,
      FixedPointMath.MATH_PRECISION - liquidationPercentageAppliedPenalty
    );
  }
}
