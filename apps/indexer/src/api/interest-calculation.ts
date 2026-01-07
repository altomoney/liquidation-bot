import { and, desc, eq, gt, gte, lte, ReadonlyDrizzle } from "ponder";
import { Hex } from "viem";

import * as schema from "../../ponder.schema";

export interface MarketStateResponse {
  chainId: number;
  address: Hex;
  blockNumber: string;
  totalSupplyAssets: string;
  totalSupplyShares: string;
  totalBorrowAssets: string;
  totalBorrowShares: string;
}

export interface MarketInfoResponse {
  chainId: number;
  address: Hex;
  type: "mint" | "borrow" | "dao_mint";
  loanToken: Hex;
  collateralToken: Hex;
}

export interface PositionHistoryResponse {
  chainId: number;
  marketId: Hex;
  user: Hex;
  blockNumber: string;
  supplyShares: string;
  borrowShares: string;
  collateral: string;
}

/**
 * Get basic market info (type, tokens, etc.)
 */
export async function getMarketInfo(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex
): Promise<MarketInfoResponse | null> {
  const row = await db.query.market.findFirst({
    where: (r) =>
      and(
        eq(r.chainId, chainId),
        eq(r.address, marketAddress.toLowerCase() as Hex)
      ),
  });

  if (!row) {
    return null;
  }

  return {
    chainId: row.chainId,
    address: row.address,
    type: row.type,
    loanToken: row.loanToken,
    collateralToken: row.collateralToken,
  };
}

/**
 * Get the market state at or before a specific block.
 */
export async function getMarketStateAtBlock(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  blockNumber: bigint
): Promise<MarketStateResponse | null> {
  const rows = await db.query.marketStateHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.address, marketAddress.toLowerCase() as Hex),
        lte(row.blockNumber, blockNumber)
      ),
    orderBy: (row) => [desc(row.blockNumber), desc(row.logIndex)],
    limit: 1,
  });

  if (rows.length > 0) {
    const row = rows[0];
    return {
      chainId: row.chainId,
      address: row.address,
      blockNumber: row.blockNumber.toString(),
      totalSupplyAssets: row.totalSupplyAssets.toString(),
      totalSupplyShares: row.totalSupplyShares.toString(),
      totalBorrowAssets: row.totalBorrowAssets.toString(),
      totalBorrowShares: row.totalBorrowShares.toString(),
    };
  }

  // If no history found, return zeros (deployment block case)
  return {
    chainId,
    address: marketAddress,
    blockNumber: blockNumber.toString(),
    totalSupplyAssets: "0",
    totalSupplyShares: "0",
    totalBorrowAssets: "0",
    totalBorrowShares: "0",
  };
}

/**
 * Get all unique users who had positions in a market up to a given block.
 */
export async function getAllUsersWithPositions(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  endBlock: bigint
): Promise<Hex[]> {
  // Get users from position history
  const historyRows = await db.query.positionHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex),
        lte(row.blockNumber, endBlock)
      ),
    columns: {
      user: true,
    },
  });

  // Get users from current positions
  const currentPositionRows = await db.query.position.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex)
      ),
    columns: {
      user: true,
    },
  });

  const allUsers = new Set<Hex>();
  for (const row of historyRows) {
    allUsers.add(row.user);
  }
  for (const row of currentPositionRows) {
    allUsers.add(row.user);
  }

  return Array.from(allUsers);
}

/**
 * Get a user's position state at or before a specific block.
 */
export async function getPositionStateAtBlock(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  user: Hex,
  blockNumber: bigint
): Promise<PositionHistoryResponse> {
  const rows = await db.query.positionHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex),
        eq(row.user, user.toLowerCase() as Hex),
        lte(row.blockNumber, blockNumber)
      ),
    orderBy: (row) => [desc(row.blockNumber), desc(row.logIndex)],
    limit: 1,
  });

  if (rows.length > 0) {
    const row = rows[0];
    return {
      chainId: row.chainId,
      marketId: row.marketId,
      user: row.user,
      blockNumber: row.blockNumber.toString(),
      supplyShares: row.supplyShares.toString(),
      borrowShares: row.borrowShares.toString(),
      collateral: row.collateral.toString(),
    };
  }

  // No position found - return zeros
  return {
    chainId,
    marketId: marketAddress,
    user,
    blockNumber: blockNumber.toString(),
    supplyShares: "0",
    borrowShares: "0",
    collateral: "0",
  };
}

/**
 * Get all position history entries for users in a market within a block range.
 */
export async function getPositionHistoryInRange(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  startBlock: bigint,
  endBlock: bigint
): Promise<PositionHistoryResponse[]> {
  const rows = await db.query.positionHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex),
        gte(row.blockNumber, startBlock),
        lte(row.blockNumber, endBlock)
      ),
    orderBy: (row) => [row.blockNumber, row.logIndex],
  });

  return rows.map((row) => ({
    chainId: row.chainId,
    marketId: row.marketId,
    user: row.user,
    blockNumber: row.blockNumber.toString(),
    supplyShares: row.supplyShares.toString(),
    borrowShares: row.borrowShares.toString(),
    collateral: row.collateral.toString(),
  }));
}

/**
 * Get the first position entry for a user in a market where they had supply shares.
 */
export async function getFirstSupplyPositionForUser(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  user: Hex
): Promise<PositionHistoryResponse | null> {
  const rows = await db.query.positionHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex),
        eq(row.user, user.toLowerCase() as Hex),
        gt(row.supplyShares, 0n)
      ),
    orderBy: (row) => [row.blockNumber, row.logIndex],
    limit: 1,
  });

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    user: row.user,
    blockNumber: row.blockNumber.toString(),
    supplyShares: row.supplyShares.toString(),
    borrowShares: row.borrowShares.toString(),
    collateral: row.collateral.toString(),
  };
}

/**
 * Get the first position entry for a user in a market where they had borrow shares.
 */
export async function getFirstBorrowPositionForUser(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  user: Hex
): Promise<PositionHistoryResponse | null> {
  const rows = await db.query.positionHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex),
        eq(row.user, user.toLowerCase() as Hex),
        gt(row.borrowShares, 0n)
      ),
    orderBy: (row) => [row.blockNumber, row.logIndex],
    limit: 1,
  });

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    user: row.user,
    blockNumber: row.blockNumber.toString(),
    supplyShares: row.supplyShares.toString(),
    borrowShares: row.borrowShares.toString(),
    collateral: row.collateral.toString(),
  };
}

/**
 * Get all position history entries for a user in a market within a block range.
 */
export async function getPositionHistoryForUser(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  user: Hex,
  startBlock: bigint,
  endBlock: bigint
): Promise<PositionHistoryResponse[]> {
  const rows = await db.query.positionHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.marketId, marketAddress.toLowerCase() as Hex),
        eq(row.user, user.toLowerCase() as Hex),
        gte(row.blockNumber, startBlock),
        lte(row.blockNumber, endBlock)
      ),
    orderBy: (row) => [row.blockNumber, row.logIndex],
  });

  return rows.map((row) => ({
    chainId: row.chainId,
    marketId: row.marketId,
    user: row.user,
    blockNumber: row.blockNumber.toString(),
    supplyShares: row.supplyShares.toString(),
    borrowShares: row.borrowShares.toString(),
    collateral: row.collateral.toString(),
  }));
}

/**
 * Get market state at or after a specific block (the first recorded state).
 */
export async function getMarketStateAtOrAfterBlock(
  db: ReadonlyDrizzle<typeof schema>,
  chainId: number,
  marketAddress: Hex,
  blockNumber: bigint
): Promise<MarketStateResponse | null> {
  const rows = await db.query.marketStateHistory.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.address, marketAddress.toLowerCase() as Hex),
        gte(row.blockNumber, blockNumber)
      ),
    orderBy: (row) => [row.blockNumber, row.logIndex],
    limit: 1,
  });

  if (rows.length > 0) {
    const row = rows[0];
    return {
      chainId: row.chainId,
      address: row.address,
      blockNumber: row.blockNumber.toString(),
      totalSupplyAssets: row.totalSupplyAssets.toString(),
      totalSupplyShares: row.totalSupplyShares.toString(),
      totalBorrowAssets: row.totalBorrowAssets.toString(),
      totalBorrowShares: row.totalBorrowShares.toString(),
    };
  }

  return null;
}

