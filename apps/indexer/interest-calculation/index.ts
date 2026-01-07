import { writeFileSync } from "fs";
import { Hex } from "viem";
import { ApiClient } from "./api-client";
import { calculateInterest } from "./calculate";
import { Config, InterestCalculationResult } from "./types";

// ============================================================
// CONFIGURATION - Modify these values as needed
// ============================================================

const CONFIG: Config = {
  // Chain ID (e.g., 1 for mainnet, 42161 for Arbitrum)
  chainId: Number(process.env.CHAIN_ID) || 1,

  // Market address to calculate interest for
  marketAddress: (process.env.MARKET_ADDRESS ||
    "0x133cf03d2A7a87B9239b1a3a8Dd62f3f27c46788") as Hex,

  // Start block (use 0n for deployment block / no prior state)
  startBlock: BigInt(0),

  // End block
  endBlock: BigInt(24172199),

  // Indexer API URL (defaults to local ponder dev server)
  indexerApiUrl: process.env.INDEXER_API_URL || "http://localhost:42069",
};

// ============================================================
// SANITY CHECKS
// ============================================================

interface SanityCheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  difference: string;
  differencePercent: string;
  message: string;
}

function runSanityChecks(
  result: InterestCalculationResult
): SanityCheckResult[] {
  const checks: SanityCheckResult[] = [];

  // Calculate totals
  const totalUserSupplyInterest = result.userInterests.reduce(
    (acc, ui) => acc + ui.supplyInterestEarned,
    0n
  );
  const totalUserBadDebtLoss = result.userInterests.reduce(
    (acc, ui) => acc + ui.supplyBadDebtLoss,
    0n
  );
  const totalUserSupplyNetChange = result.userInterests.reduce(
    (acc, ui) => acc + ui.supplyNetChange,
    0n
  );
  const totalUserBorrowInterest = result.userInterests.reduce(
    (acc, ui) => acc + ui.borrowInterestOwed,
    0n
  );

  // Detect bad debt
  const usersWithBadDebtLoss = result.userInterests.filter(
    (ui) => ui.supplyBadDebtLoss > 0n
  );

  if (usersWithBadDebtLoss.length > 0) {
    checks.push({
      name: "Bad Debt Detection",
      passed: true, // Informational, not a failure
      expected: "No bad debt losses",
      actual: `${usersWithBadDebtLoss.length} users absorbed bad debt losses`,
      difference: totalUserBadDebtLoss.toString(),
      differencePercent: "N/A",
      message: `${usersWithBadDebtLoss.length} suppliers lost ${totalUserBadDebtLoss} due to bad debt. Their interest earned: ${totalUserSupplyInterest}, bad debt loss: ${totalUserBadDebtLoss}, net: ${totalUserSupplyNetChange}`,
    });
  }

  const marketSupplyAssetChange =
    result.marketStateAtEnd.totalSupplyAssets -
    result.marketStateAtStart.totalSupplyAssets;

  const marketBorrowAssetChange =
    result.marketStateAtEnd.totalBorrowAssets -
    result.marketStateAtStart.totalBorrowAssets;

  // Check: Supply interest vs Borrow interest balance
  // This check only applies to BORROW markets where suppliers earn from borrower interest
  // In MINT markets, there are no external suppliers - interest goes to protocol
  // Note: With bad debt, supply interest can be LESS than expected (or even negative)
  // because suppliers absorb losses when borrowers default
  if (result.marketType === "borrow") {
    const interestDifference =
      totalUserBorrowInterest - totalUserSupplyInterest;
    const interestDiffPercent =
      totalUserBorrowInterest > 0n
        ? (interestDifference * 10000n) / totalUserBorrowInterest
        : 0n;

    // Allow for small rounding errors (up to 0.0001% or 1000 wei, whichever is larger)
    // Rounding errors occur due to integer division in share-to-asset conversions
    const roundingTolerance = 1000n;
    const percentTolerance =
      totalUserBorrowInterest > 0n ? totalUserBorrowInterest / 1000000n : 1000n; // 0.0001%
    const tolerance =
      roundingTolerance > percentTolerance
        ? roundingTolerance
        : percentTolerance;

    // With bad debt, supply NET change can be less than borrow interest
    // Without bad debt, supply interest should roughly equal borrow interest (minus protocol fee)
    // Supply interest should NOT exceed borrow interest significantly (that would be a bug)
    const withinTolerance = interestDifference >= -tolerance;
    const hasBadDebt = usersWithBadDebtLoss.length > 0;

    let message: string;
    if (interestDifference > 0n) {
      // Borrow > Supply: Normal case (protocol fee) OR bad debt occurred
      if (hasBadDebt) {
        message = `Borrow interest exceeds supply by ${interestDifference}. Includes protocol fees AND bad debt losses (${totalUserBadDebtLoss}) absorbed by suppliers.`;
      } else {
        message = `OK: Protocol fee portion = ${interestDifference} (${
          Number(interestDiffPercent) / 100
        }% of borrow interest)`;
      }
    } else if (withinTolerance) {
      message = `OK: Within rounding tolerance (${-interestDifference} wei difference, tolerance: ${tolerance})`;
    } else {
      message = `WARNING: Supply interest exceeds borrow interest by ${-interestDifference}. This should not happen.`;
    }

    checks.push({
      name: "Supply vs Borrow Interest Balance (Borrow Market)",
      passed: withinTolerance,
      expected: `Borrow interest >= Supply interest (within rounding tolerance)`,
      actual: `Borrow: ${totalUserBorrowInterest}, Supply: ${totalUserSupplyInterest}`,
      difference: interestDifference.toString(),
      differencePercent: `${Number(interestDiffPercent) / 100}%`,
      message,
    });
  } else {
    // For MINT markets, supply interest calculation doesn't apply the same way
    checks.push({
      name: "Mint Market - No Supply/Borrow Balance Check",
      passed: true,
      expected: `N/A for mint markets`,
      actual: `Borrow interest: ${totalUserBorrowInterest}, Supply interest (fee recipient): ${totalUserSupplyInterest}`,
      difference: "N/A",
      differencePercent: "N/A",
      message: `Mint market: Borrowers pay interest to protocol. Supply interest only applies to fee recipient shares.`,
    });
  }

  // Check: Market borrow growth vs calculated interest
  // Shows how much of market growth came from interest vs new principal
  const borrowGrowthDiff = marketBorrowAssetChange - totalUserBorrowInterest;
  const interestAsPercentOfBorrowGrowth =
    marketBorrowAssetChange !== 0n
      ? (totalUserBorrowInterest * 10000n) /
        (marketBorrowAssetChange > 0n
          ? marketBorrowAssetChange
          : -marketBorrowAssetChange)
      : 0n;

  checks.push({
    name: "Borrow Growth Breakdown",
    passed: true,
    expected: `Market borrow change = Interest accrued + Net new borrows`,
    actual: `Market change: ${marketBorrowAssetChange}, Interest: ${totalUserBorrowInterest}, Net principal: ${borrowGrowthDiff}`,
    difference: borrowGrowthDiff.toString(),
    differencePercent: `${Number(interestAsPercentOfBorrowGrowth) / 100}%`,
    message: `Interest accounts for ${
      Number(interestAsPercentOfBorrowGrowth) / 100
    }% of borrow growth. Remaining ${
      100 - Number(interestAsPercentOfBorrowGrowth) / 100
    }% is net new borrows.`,
  });

  // Check: Market supply growth vs calculated interest (only meaningful for borrow markets)
  if (result.marketType === "borrow") {
    const supplyGrowthDiff = marketSupplyAssetChange - totalUserSupplyInterest;
    const interestAsPercentOfSupplyGrowth =
      marketSupplyAssetChange !== 0n
        ? (totalUserSupplyInterest * 10000n) /
          (marketSupplyAssetChange > 0n
            ? marketSupplyAssetChange
            : -marketSupplyAssetChange)
        : 0n;

    checks.push({
      name: "Supply Growth Breakdown",
      passed: true,
      expected: `Market supply change = Interest earned + Net deposits`,
      actual: `Market change: ${marketSupplyAssetChange}, Interest: ${totalUserSupplyInterest}, Net deposits: ${supplyGrowthDiff}`,
      difference: supplyGrowthDiff.toString(),
      differencePercent: `${Number(interestAsPercentOfSupplyGrowth) / 100}%`,
      message: `Interest accounts for ${
        Number(interestAsPercentOfSupplyGrowth) / 100
      }% of supply growth. Remaining ${
        100 - Number(interestAsPercentOfSupplyGrowth) / 100
      }% is net deposits.`,
    });
  }

  return checks;
}

// ============================================================
// OUTPUT FORMATTING
// ============================================================

function formatBigInt(value: bigint): string {
  return value.toString();
}

function serializeResult(result: InterestCalculationResult): object {
  return {
    chainId: result.chainId,
    marketAddress: result.marketAddress,
    marketType: result.marketType,
    startBlock: formatBigInt(result.startBlock),
    endBlock: formatBigInt(result.endBlock),
    marketStateAtStart: {
      blockNumber: formatBigInt(result.marketStateAtStart.blockNumber),
      totalSupplyAssets: formatBigInt(
        result.marketStateAtStart.totalSupplyAssets
      ),
      totalSupplyShares: formatBigInt(
        result.marketStateAtStart.totalSupplyShares
      ),
      totalBorrowAssets: formatBigInt(
        result.marketStateAtStart.totalBorrowAssets
      ),
      totalBorrowShares: formatBigInt(
        result.marketStateAtStart.totalBorrowShares
      ),
    },
    marketStateAtEnd: {
      blockNumber: formatBigInt(result.marketStateAtEnd.blockNumber),
      totalSupplyAssets: formatBigInt(
        result.marketStateAtEnd.totalSupplyAssets
      ),
      totalSupplyShares: formatBigInt(
        result.marketStateAtEnd.totalSupplyShares
      ),
      totalBorrowAssets: formatBigInt(
        result.marketStateAtEnd.totalBorrowAssets
      ),
      totalBorrowShares: formatBigInt(
        result.marketStateAtEnd.totalBorrowShares
      ),
    },
    userInterests: result.userInterests.map((ui) => ({
      user: ui.user,
      supply: {
        sharesAtStart: formatBigInt(ui.supplySharesAtStart),
        sharesAtEnd: formatBigInt(ui.supplySharesAtEnd),
        assetsAtStart: formatBigInt(ui.supplyAssetsAtStart),
        assetsAtEnd: formatBigInt(ui.supplyAssetsAtEnd),
        interestEarned: formatBigInt(ui.supplyInterestEarned),
        badDebtLoss: formatBigInt(ui.supplyBadDebtLoss),
        netChange: formatBigInt(ui.supplyNetChange),
      },
      borrow: {
        sharesAtStart: formatBigInt(ui.borrowSharesAtStart),
        sharesAtEnd: formatBigInt(ui.borrowSharesAtEnd),
        assetsAtStart: formatBigInt(ui.borrowAssetsAtStart),
        assetsAtEnd: formatBigInt(ui.borrowAssetsAtEnd),
        interestOwed: formatBigInt(ui.borrowInterestOwed),
      },
      netInterest: formatBigInt(ui.netInterest),
    })),
    summary: {
      totalUsersWithInterest: result.userInterests.length,
      totalSupplyInterestEarned: formatBigInt(
        result.userInterests.reduce(
          (acc, ui) => acc + ui.supplyInterestEarned,
          0n
        )
      ),
      totalSupplyBadDebtLoss: formatBigInt(
        result.userInterests.reduce((acc, ui) => acc + ui.supplyBadDebtLoss, 0n)
      ),
      totalSupplyNetChange: formatBigInt(
        result.userInterests.reduce((acc, ui) => acc + ui.supplyNetChange, 0n)
      ),
      usersWithBadDebtLoss: result.userInterests.filter(
        (ui) => ui.supplyBadDebtLoss > 0n
      ).length,
      totalBorrowInterestOwed: formatBigInt(
        result.userInterests.reduce(
          (acc, ui) => acc + ui.borrowInterestOwed,
          0n
        )
      ),
    },
    sanityChecks: runSanityChecks(result),
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log("Interest Calculation Script");
  console.log("=".repeat(60));

  // Validate config
  if (CONFIG.marketAddress === "0x0000000000000000000000000000000000000000") {
    console.error("Error: MARKET_ADDRESS environment variable is required");
    process.exit(1);
  }

  if (CONFIG.endBlock === 0n) {
    console.error("Error: END_BLOCK environment variable is required");
    process.exit(1);
  }

  console.log("\nConfiguration:");
  console.log(`  Chain ID: ${CONFIG.chainId}`);
  console.log(`  Market Address: ${CONFIG.marketAddress}`);
  console.log(`  Start Block: ${CONFIG.startBlock}`);
  console.log(`  End Block: ${CONFIG.endBlock}`);
  console.log(`  Indexer API URL: ${CONFIG.indexerApiUrl}`);
  console.log("");

  // Create API client
  const apiClient = new ApiClient(CONFIG.indexerApiUrl);

  // Calculate interest
  const result = await calculateInterest(apiClient, CONFIG);

  // Serialize result
  const serialized = serializeResult(result);
  const jsonOutput = JSON.stringify(serialized, null, 2);

  // Write to file
  const outputFileName = `interest-${CONFIG.marketAddress}-${CONFIG.startBlock}-${CONFIG.endBlock}.json`;
  const outputPath = `./interest-calculation/${outputFileName}`;
  writeFileSync(outputPath, jsonOutput);
  console.log(`\nResult saved to: ${outputPath}`);

  // Also output summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY:");
  console.log("=".repeat(60));
  console.log(`Total users with interest: ${result.userInterests.length}`);

  const totalSupplyInterest = result.userInterests.reduce(
    (acc, ui) => acc + ui.supplyInterestEarned,
    0n
  );
  const totalBorrowInterest = result.userInterests.reduce(
    (acc, ui) => acc + ui.borrowInterestOwed,
    0n
  );

  console.log(`Total supply interest earned: ${totalSupplyInterest}`);
  console.log(`Total borrow interest owed: ${totalBorrowInterest}`);

  // Run and display sanity checks
  const sanityChecks = runSanityChecks(result);
  console.log("\n" + "=".repeat(60));
  console.log("SANITY CHECKS:");
  console.log("=".repeat(60));

  for (const check of sanityChecks) {
    const status = check.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`\n${status}: ${check.name}`);
    console.log(`  ${check.message}`);
    console.log(
      `  Difference: ${check.difference} (${check.differencePercent})`
    );
  }

  const allPassed = sanityChecks.every((c) => c.passed);
  console.log("\n" + "-".repeat(60));
  console.log(
    allPassed
      ? "All sanity checks passed!"
      : "WARNING: Some sanity checks failed. Review the results."
  );
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
