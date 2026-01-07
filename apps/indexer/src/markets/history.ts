import { ponder } from "ponder:registry";
import {
  market,
  marketStateHistory,
  position,
  positionHistory,
} from "ponder:schema";
import { Address, Hex } from "viem";

type Context = Parameters<
  Parameters<typeof ponder.on<"AltoBorrowMarket:AccrueInterest">>[1]
>[0]["context"];

type Event = {
  block: { number: bigint };
  log: { address: Address; logIndex: number };
};

/**
 * Logs a position snapshot to the history table.
 * Should be called AFTER the position has been updated.
 */
export async function logPositionHistory(
  context: Context,
  event: Event,
  user: Hex
) {
  const pos = await context.db.find(position, {
    chainId: context.chain.id,
    marketId: event.log.address,
    user: user,
  });

  if (!pos) {
    return;
  }

  const id = `${context.chain.id}-${event.log.address}-${user}-${event.block.number}-${event.log.logIndex}`;

  await context.db.insert(positionHistory).values({
    id,
    chainId: context.chain.id,
    marketId: event.log.address,
    user: user,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    supplyShares: pos.supplyShares,
    borrowShares: pos.borrowShares,
    collateral: pos.collateral,
  });
}

/**
 * Logs a market state snapshot to the history table.
 * Should be called AFTER the market state has been updated.
 */
export async function logMarketStateHistory(context: Context, event: Event) {
  const mkt = await context.db.find(market, {
    chainId: context.chain.id,
    address: event.log.address,
  });

  if (!mkt) {
    return;
  }

  const id = `${context.chain.id}-${event.log.address}-${event.block.number}-${event.log.logIndex}`;

  await context.db.insert(marketStateHistory).values({
    id,
    chainId: context.chain.id,
    address: event.log.address,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    totalSupplyAssets: mkt.totalSupplyAssets,
    totalSupplyShares: mkt.totalSupplyShares,
    totalBorrowAssets: mkt.totalBorrowAssets,
    totalBorrowShares: mkt.totalBorrowShares,
  });
}
