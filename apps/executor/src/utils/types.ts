import type {
  ILiquidatablePosition,
  IndexerApiResponse,
  IMarket as IndexerIMarketType,
  IndexerActiveUsmsResponse as IndexerIndexerActiveUsmsResponseType,
} from "@liquidation-bot/indexer/src/api/types";
import type { Address, Hex } from "viem";

export interface ToConvert {
  src: Address;
  dst: Address;
  srcAmount: bigint;
}

export interface ConversionRouteResult {
  success: boolean;
  toConvert: ToConvert;
  path: string[];
  errors: string[];
  calls: Hex[];
}

export type IMarket = IndexerIMarketType;

export type LiquidatablePosition = ILiquidatablePosition;

export type IndexerAPIResponse = IndexerApiResponse;

export type IndexerActiveUsmsResponse = IndexerIndexerActiveUsmsResponseType;
