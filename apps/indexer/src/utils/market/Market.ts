import { IIrm } from "../irm/types";
import { AssetShareConversionMath } from "../math/AssetShareConversionMath";
import { FixedPointMath } from "../math/FixedPointMath";
import { MarketDb } from "./types";

export const LENDING_ORACLE_PRICE_PRECISION = 10n ** 36n;

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

        // Simulate interest fee shares for borrow markets
        // Mirrors AltoBorrowMarket._accrueInterest() fee share logic
        if (interest > 0n && this.market.interestFee > 0n) {
          const feeBorrowAssets = FixedPointMath.multiplyWithPrecision(
            interest,
            this.market.interestFee
          );
          const feeShares = AssetShareConversionMath.convertToSharesDown(
            feeBorrowAssets,
            this.market.totalSupplyAssets - feeBorrowAssets,
            this.market.totalSupplyShares
          );
          this.market.totalSupplyShares += feeShares;
        }
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

  public get collateralPrice() {
    return this.price;
  }

  public get maxLtv() {
    return this.market.ltv;
  }
}
