import type {
  ILiquidatablePosition,
  IndexerApiResponse,
  IMarket as IndexerIMarketType,
  IndexerActiveUsmsResponse as IndexerIndexerActiveUsmsResponseType,
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

export type IndexerActiveUsmsResponse = IndexerIndexerActiveUsmsResponseType;
