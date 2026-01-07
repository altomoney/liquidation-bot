import { Hex } from "viem";
import { ApiClient } from "./api-client";
import { convertBorrowSharesToAssets, convertSupplySharesToAssets } from "./math";
import {
  Config,
  InterestCalculationResult,
  MarketState,
  PositionState,
  UserInterest,
} from "./types";

/**
 * Calculate interest for a single user by tracking all their position changes.
 *
 * The approach:
 * 1. Get all position history entries for the user
 * 2. For each segment (between consecutive entries), calculate interest on shares held
 * 3. Sum up all segment interests
 *
 * Interest for a segment = shares * (endRate - startRate)
 * Where rate = totalAssets / totalShares
 *
 * We track positive and negative changes separately:
 * - Positive changes = interest earned (from AccrueInterest events)
 * - Negative changes = bad debt losses (from liquidations with bad debt)
 */
async function calculateUserInterestWithHistory(
  apiClient: ApiClient,
  chainId: number,
  marketAddress: Hex,
  user: Hex,
  startBlock: bigint,
  endBlock: bigint,
  positionAtStart: PositionState,
  positionAtEnd: PositionState,
  marketStateAtStart: MarketState,
  marketStateAtEnd: MarketState
): Promise<UserInterest> {
  // Get all position changes for this user within the block range
  const positionHistory = await apiClient.getPositionHistoryForUser(
    chainId,
    marketAddress,
    user,
    startBlock,
    endBlock
  );

  let supplyInterestEarned = 0n; // Positive changes (interest)
  let supplyBadDebtLoss = 0n; // Negative changes (bad debt)
  let borrowInterestOwed = 0n;

  // Build segments: each segment has (shares, startMarketState, endMarketState)
  // Start with position at startBlock (if any)
  // Then process each history entry as a potential change point

  interface Segment {
    supplyShares: bigint;
    borrowShares: bigint;
    startBlock: bigint;
    endBlock: bigint;
  }

  const segments: Segment[] = [];

  // Initial state
  let currentSupplyShares = positionAtStart.supplyShares;
  let currentBorrowShares = positionAtStart.borrowShares;
  let currentBlock = startBlock;

  // Add history entries as change points
  for (const entry of positionHistory) {
    if (entry.blockNumber > currentBlock) {
      // Close the current segment
      if (currentSupplyShares > 0n || currentBorrowShares > 0n) {
        segments.push({
          supplyShares: currentSupplyShares,
          borrowShares: currentBorrowShares,
          startBlock: currentBlock,
          endBlock: entry.blockNumber,
        });
      }
      currentBlock = entry.blockNumber;
    }
    // Update current shares to this entry's values
    currentSupplyShares = entry.supplyShares;
    currentBorrowShares = entry.borrowShares;
  }

  // Final segment from last change to endBlock
  if (currentBlock < endBlock && (currentSupplyShares > 0n || currentBorrowShares > 0n)) {
    segments.push({
      supplyShares: currentSupplyShares,
      borrowShares: currentBorrowShares,
      startBlock: currentBlock,
      endBlock: endBlock,
    });
  }

  // Calculate interest for each segment
  for (const segment of segments) {
    // Get market states at segment boundaries
    const segmentStartState = segment.startBlock === startBlock
      ? marketStateAtStart
      : await apiClient.getMarketStateAtBlock(chainId, marketAddress, segment.startBlock);
    const segmentEndState = segment.endBlock === endBlock
      ? marketStateAtEnd
      : await apiClient.getMarketStateAtBlock(chainId, marketAddress, segment.endBlock);

    // Calculate supply interest for this segment
    // Positive change = interest earned, Negative change = bad debt loss
    if (segment.supplyShares > 0n) {
      const startValue = convertSupplySharesToAssets(segment.supplyShares, segmentStartState);
      const endValue = convertSupplySharesToAssets(segment.supplyShares, segmentEndState);
      const change = endValue - startValue;
      if (change >= 0n) {
        supplyInterestEarned += change;
      } else {
        supplyBadDebtLoss += -change; // Store as positive value
      }
    }

    // Calculate borrow interest for this segment
    if (segment.borrowShares > 0n) {
      const startValue = convertBorrowSharesToAssets(segment.borrowShares, segmentStartState);
      const endValue = convertBorrowSharesToAssets(segment.borrowShares, segmentEndState);
      borrowInterestOwed += endValue - startValue;
    }
  }

  // Calculate final asset values for reporting
  const supplyAssetsAtStart = convertSupplySharesToAssets(
    positionAtStart.supplyShares,
    marketStateAtStart
  );
  const supplyAssetsAtEnd = convertSupplySharesToAssets(
    positionAtEnd.supplyShares,
    marketStateAtEnd
  );
  const borrowAssetsAtStart = convertBorrowSharesToAssets(
    positionAtStart.borrowShares,
    marketStateAtStart
  );
  const borrowAssetsAtEnd = convertBorrowSharesToAssets(
    positionAtEnd.borrowShares,
    marketStateAtEnd
  );

  // Net change for supply = interest earned - bad debt loss
  const supplyNetChange = supplyInterestEarned - supplyBadDebtLoss;
  // Net interest = supply net change - borrow interest owed
  const netInterest = supplyNetChange - borrowInterestOwed;

  return {
    user,
    supplySharesAtStart: positionAtStart.supplyShares,
    supplySharesAtEnd: positionAtEnd.supplyShares,
    supplyAssetsAtStart,
    supplyAssetsAtEnd,
    supplyInterestEarned,
    supplyBadDebtLoss,
    supplyNetChange,
    borrowSharesAtStart: positionAtStart.borrowShares,
    borrowSharesAtEnd: positionAtEnd.borrowShares,
    borrowAssetsAtStart,
    borrowAssetsAtEnd,
    borrowInterestOwed,
    netInterest,
  };
}

/**
 * Calculate interest for all users in a market between two blocks.
 */
export async function calculateInterest(
  apiClient: ApiClient,
  config: Config
): Promise<InterestCalculationResult> {
  const { chainId, marketAddress, startBlock, endBlock } = config;

  console.log(`Calculating interest for market ${marketAddress}`);
  console.log(`Block range: ${startBlock} -> ${endBlock}`);

  // Get market info (type, tokens)
  const marketInfo = await apiClient.getMarketInfo(chainId, marketAddress);
  if (!marketInfo) {
    throw new Error(`Market ${marketAddress} not found`);
  }
  console.log(`Market type: ${marketInfo.type}`);

  // Get market state at start and end blocks
  const marketStateAtStart = await apiClient.getMarketStateAtBlock(
    chainId,
    marketAddress,
    startBlock
  );
  const marketStateAtEnd = await apiClient.getMarketStateAtBlock(
    chainId,
    marketAddress,
    endBlock
  );

  console.log(`Market state at start block ${startBlock}:`);
  console.log(
    `  Total Supply: ${marketStateAtStart.totalSupplyAssets} assets, ${marketStateAtStart.totalSupplyShares} shares`
  );
  console.log(
    `  Total Borrow: ${marketStateAtStart.totalBorrowAssets} assets, ${marketStateAtStart.totalBorrowShares} shares`
  );

  console.log(`Market state at end block ${endBlock}:`);
  console.log(
    `  Total Supply: ${marketStateAtEnd.totalSupplyAssets} assets, ${marketStateAtEnd.totalSupplyShares} shares`
  );
  console.log(
    `  Total Borrow: ${marketStateAtEnd.totalBorrowAssets} assets, ${marketStateAtEnd.totalBorrowShares} shares`
  );

  // Get all users who have ever had positions in this market
  const users = await apiClient.getAllUsersWithPositions(
    chainId,
    marketAddress,
    endBlock
  );

  console.log(`Found ${users.length} users with positions`);

  // Calculate interest for each user
  const userInterests: UserInterest[] = [];

  for (const user of users) {
    const positionAtStart = await apiClient.getPositionStateAtBlock(
      chainId,
      marketAddress,
      user,
      startBlock
    );
    const positionAtEnd = await apiClient.getPositionStateAtBlock(
      chainId,
      marketAddress,
      user,
      endBlock
    );

    // Skip users with no position at either block and no history in between
    // (we'll still process them via history)

    const interest = await calculateUserInterestWithHistory(
      apiClient,
      chainId,
      marketAddress,
      user,
      startBlock,
      endBlock,
      positionAtStart,
      positionAtEnd,
      marketStateAtStart,
      marketStateAtEnd
    );

    // Include users with any interest or positions at end
    if (
      interest.supplyInterestEarned !== 0n ||
      interest.borrowInterestOwed !== 0n ||
      interest.supplySharesAtEnd !== 0n ||
      interest.borrowSharesAtEnd !== 0n
    ) {
      userInterests.push(interest);
    }
  }

  console.log(
    `Calculated interest for ${userInterests.length} users with positions`
  );

  // Debug: Show top 5 supply and borrow interest users
  const sortedBySupply = [...userInterests].sort(
    (a, b) => Number(b.supplyInterestEarned - a.supplyInterestEarned)
  );
  const sortedByBorrow = [...userInterests].sort(
    (a, b) => Number(b.borrowInterestOwed - a.borrowInterestOwed)
  );

  console.log("\nTop 5 Supply Interest Earners:");
  for (const u of sortedBySupply.slice(0, 5)) {
    console.log(`  ${u.user}: ${u.supplyInterestEarned} (shares: ${u.supplySharesAtStart} -> ${u.supplySharesAtEnd})`);
  }

  console.log("\nTop 5 Borrow Interest Owers:");
  for (const u of sortedByBorrow.slice(0, 5)) {
    console.log(`  ${u.user}: ${u.borrowInterestOwed} (shares: ${u.borrowSharesAtStart} -> ${u.borrowSharesAtEnd})`);
  }

  return {
    chainId,
    marketAddress,
    marketType: marketInfo.type,
    startBlock,
    endBlock,
    marketStateAtStart,
    marketStateAtEnd,
    userInterests,
  };
}
