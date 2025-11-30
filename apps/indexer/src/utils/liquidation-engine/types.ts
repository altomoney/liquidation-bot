import schema from "ponder:schema";
import { Address } from "viem";
import { PositionDb } from "../market/types";

export interface ILiquidationEngine {
  seizableCollateralOfPosition(
    _position: PositionDb,
    liquidatorAddress: Address,
    additionalData: any
  ): bigint;
}

export type LiquidationEngineDb = typeof schema.liquidationEngine.$inferSelect;
