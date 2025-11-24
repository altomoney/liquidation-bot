import type {
  ILiquidatablePosition,
  IndexerApiResponse,
  IMarket as IndexerIMarketType,
} from "@liquidation-bot/indexer/src/api/types";
import type { Address } from "viem";

export interface ToConvert {
  src: Address;
  dst: Address;
  srcAmount: bigint;
}

export type IMarket = IndexerIMarketType;

export type LiquidatablePosition = ILiquidatablePosition;

export type IndexerAPIResponse = IndexerApiResponse;
