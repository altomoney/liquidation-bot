import { usmAbi } from "@/abis/usm";
import { DusdAbi } from "@/indexer/abis/DusdAbi";
import { UsmRegistryAbi } from "@/indexer/abis/UsmRegistryAbi";
import type {
  IMarket,
  IndexerAPIResponse,
  IndexerActiveUsmsResponse,
} from "@/utils/types";
import nock from "nock";
import {
  encodeAbiParameters,
  erc20Abi,
  getAddress,
  keccak256,
  padHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { assert } from "vitest";
import {
  ADDRESSES,
  ORACLE_PRICE_PRECISION,
  PONDER_BASE_URL,
} from "./constants";
import type { AnvilClient } from "./setup";

import { simplifiedMarketAbi } from "./abis/simplified-market";
import { simplifiedOracleAbi } from "./abis/simplified-oracle";

/**
 * Generate EVM runtime bytecode that returns a fixed uint256 on any call.
 * Layout: PUSH32 <value> | PUSH1 0x00 | MSTORE | PUSH1 0x20 | PUSH1 0x00 | RETURN
 */
export function generateConstantReturnBytecode(value: bigint): Hex {
  const valueHex = padHex(toHex(value), { size: 32 }).slice(2);
  return `0x7f${valueHex}60005260206000f3` as Hex;
}

/**
 * Replace an oracle contract's code so getPrice() returns a fixed value.
 * Works on any oracle since the bytecode returns the value on any call.
 */
export async function setOraclePrice(
  client: AnvilClient,
  oracleAddress: Address,
  price: bigint,
) {
  await client.setCode({
    address: oracleAddress,
    bytecode: generateConstantReturnBytecode(price),
  });
}

/**
 * Read the current position for a user on a market.
 */
export async function readMarketPosition(
  client: AnvilClient,
  marketAddress: Address,
  user: Address,
) {
  const [supplyShares, borrowShares, collateralAssets] =
    await client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "position",
      args: [user],
    });

  return { supplyShares, borrowShares, collateralAssets };
}

/**
 * Read market state needed for constructing indexer mock responses.
 */
export async function readMarketState(
  client: AnvilClient,
  marketAddress: Address,
) {
  const [
    collateralToken,
    borrowToken,
    oracleAddr,
    maxLtv,
    totalBorrowed,
    totalSupplied,
    irmAddr,
    liquidationEngineAddr,
    feeRecipient,
    marketTypeId,
  ] = await Promise.all([
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "collateralToken",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "borrowToken",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "oracle",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "maxLtv",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "totalBorrowed",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "totalSupply",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "irm",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "liquidationEngine",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "feeRecipient",
    }),
    client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "MARKET_TYPE",
    }),
  ]);

  const marketType =
    marketTypeId === 0 ? "borrow" : marketTypeId === 1 ? "mint" : "dao_mint";

  // interestFee only exists on borrow markets
  let interestFee = 0n;
  if (marketType === "borrow") {
    interestFee = await client.readContract({
      address: marketAddress,
      abi: simplifiedMarketAbi,
      functionName: "interestFee",
    });
  }

  const oraclePrice = await client.readContract({
    address: oracleAddr,
    abi: simplifiedOracleAbi,
    functionName: "getPrice",
  });

  return {
    collateralToken,
    borrowToken,
    oracle: oracleAddr,
    oraclePrice,
    maxLtv,
    totalBorrowAssets: totalBorrowed[0],
    totalBorrowShares: totalBorrowed[1],
    totalSupplyAssets: totalSupplied[0],
    totalSupplyShares: totalSupplied[1],
    irm: irmAddr,
    liquidationEngine: liquidationEngineAddr,
    interestFee,
    feeRecipient,
    marketType: marketType as "borrow" | "mint" | "dao_mint",
  };
}

/**
 * Deal ERC20 tokens to an account by setting balance via storage manipulation.
 * Uses the standard ERC20 balanceOf mapping at slot 0, 1, 2, ... by probing.
 */
export async function dealErc20(
  client: AnvilClient,
  token: Address,
  to: Address,
  amount: bigint,
) {
  // Try common balanceOf storage slots (0-10) used by most ERC20s
  for (let slot = 0n; slot <= 10n; slot++) {
    const balanceSlot = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [to, slot],
      ),
    );

    const balanceBefore = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [to],
    });

    const probe = balanceBefore + 1337n;
    await client.setStorageAt({
      address: token,
      index: balanceSlot,
      value: padHex(toHex(probe), { size: 32 }),
    });

    const balanceAfter = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [to],
    });

    if (balanceAfter === probe) {
      // Found the correct slot — set the actual amount
      await client.setStorageAt({
        address: token,
        index: balanceSlot,
        value: padHex(toHex(amount), { size: 32 }),
      });
      return;
    }

    // Revert the probe
    await client.setStorageAt({
      address: token,
      index: balanceSlot,
      value: padHex(toHex(balanceBefore), { size: 32 }),
    });
  }

  throw new Error(`Could not find balanceOf storage slot for token ${token}`);
}

export interface SetupPositionParams {
  marketAddress: Address;
  borrower: Address;
  collateralAmount: bigint;
  /** Fraction of max borrow to take (0-1). Default 0.95 */
  borrowRatio?: number;
}

/**
 * Set up a position on a real mainnet-forked market:
 * 1. Deal collateral tokens to borrower
 * 2. Approve + addCollateral
 * 3. Borrow near max LTV
 */
export async function setupPosition(
  client: AnvilClient,
  params: SetupPositionParams,
) {
  const {
    marketAddress,
    borrower,
    collateralAmount,
    borrowRatio = 0.95,
  } = params;

  console.log("[setupPosition] Reading market state...");
  const state = await readMarketState(client, marketAddress);
  console.log("[setupPosition] Market state read. Dealing collateral...");

  await dealErc20(client, state.collateralToken, borrower, collateralAmount);
  console.log("[setupPosition] Collateral dealt. Approving...");

  // Approve market to spend collateral
  await client.writeContract({
    address: state.collateralToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [marketAddress, collateralAmount],
    account: borrower,
  });

  // Add collateral
  await client.writeContract({
    address: marketAddress,
    abi: simplifiedMarketAbi,
    functionName: "addCollateral",
    args: [collateralAmount, borrower],
    account: borrower,
  });

  // Calculate max borrow: collateralValue * maxLtv / WAD
  // collateralValue = collateral * oraclePrice / ORACLE_PRECISION
  const collateralValue =
    (collateralAmount * state.oraclePrice) / ORACLE_PRICE_PRECISION;
  const maxBorrow = (collateralValue * state.maxLtv) / 10n ** 18n;
  const borrowAmount =
    (maxBorrow * BigInt(Math.floor(borrowRatio * 10000))) / 10000n;

  if (borrowAmount === 0n) {
    throw new Error("Computed borrow amount is 0");
  }

  // For borrow markets, we need supply liquidity. Deal loan tokens and supply.
  if (state.marketType === "borrow") {
    const accounts = await client.getAddresses();
    const supplier2 = accounts[0];
    if (!supplier2) {
      throw new Error("Missing Anvil supplier account");
    }

    const supplyAmount = borrowAmount * 2n;
    await dealErc20(client, state.borrowToken, supplier2, supplyAmount);

    await client.writeContract({
      address: state.borrowToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [marketAddress, supplyAmount],
      account: supplier2,
    });

    console.log("[setupPosition] Supplying", supplyAmount, "to market...");
    const supplyHash = await client.writeContract({
      address: marketAddress,
      abi: [
        {
          type: "function",
          name: "addSupply",
          inputs: [
            { name: "assets", type: "uint256" },
            { name: "shares", type: "uint256" },
            { name: "onBehalf", type: "address" },
          ],
          outputs: [
            { name: "", type: "uint256" },
            { name: "", type: "uint256" },
          ],
          stateMutability: "nonpayable",
        },
      ] as const,
      functionName: "addSupply",
      args: [supplyAmount, 0n, supplier2],
      account: supplier2,
    });
    const supplyReceipt = await client.waitForTransactionReceipt({
      hash: supplyHash,
    });
    console.log("[setupPosition] Supply tx status:", supplyReceipt.status);
  }

  console.log("[setupPosition] Borrowing", borrowAmount, "...");
  const borrowHash = await client.writeContract({
    address: marketAddress,
    abi: simplifiedMarketAbi,
    functionName: "borrow",
    args: [borrowAmount, 0n, borrower, borrower, "0x"],
    account: borrower,
  });
  const borrowReceipt = await client.waitForTransactionReceipt({
    hash: borrowHash,
  });
  console.log("[setupPosition] Borrow tx status:", borrowReceipt.status);

  const position = await readMarketPosition(client, marketAddress, borrower);
  console.log("[setupPosition] Position after borrow:", position);
  const updatedState = await readMarketState(client, marketAddress);

  return { position, marketState: updatedState, borrowAmount };
}

/**
 * Build a mock IMarket object from on-chain state, suitable for the indexer API response.
 */
export function buildMockMarketResponse(
  marketAddress: Address,
  state: Awaited<ReturnType<typeof readMarketState>>,
  oraclePrice: bigint,
  chainId: number,
): IMarket {
  return {
    chainId,
    address: marketAddress,
    type: state.marketType,
    loanToken: state.borrowToken,
    collateralToken: state.collateralToken,
    feeRecipient: state.feeRecipient,
    oracle: state.oracle,
    irm: state.irm,
    liquidationEngine: state.liquidationEngine,
    ltv: state.maxLtv,
    totalSupplyAssets: state.totalSupplyAssets,
    totalSupplyShares: state.totalSupplyShares,
    totalBorrowAssets: state.totalBorrowAssets,
    totalBorrowShares: state.totalBorrowShares,
    price: oraclePrice,
    irmConfig: null,
    liquidationEngineConfig: {
      chainId,
      address: state.liquidationEngine,
      marketAddress,
      type: "DlbDcfPriorityLiquidationEngine",
      config: null,
    },
  };
}

/**
 * Mock the indexer liquidatable-positions endpoint with nock.
 */
export function mockIndexerLiquidatablePositions(
  chainId: number,
  responses: IndexerAPIResponse[],
) {
  return nock(PONDER_BASE_URL)
    .post(`/chain/${chainId}/liquidatable-positions`)
    .reply(
      200,
      JSON.stringify({ results: responses, warnings: [] }, (_key, value) =>
        typeof value === "bigint" ? `${value}n` : value,
      ),
      { "Content-Type": "application/json" },
    );
}

/**
 * Mock the indexer active-usms endpoint with nock.
 */
export function mockIndexerActiveUsms(
  chainId: number,
  usms: IndexerActiveUsmsResponse["activeUsms"] = [],
) {
  return nock(PONDER_BASE_URL)
    .post(`/chain/${chainId}/active-usms`)
    .reply(
      200,
      JSON.stringify({ activeUsms: usms }, (_key, value) =>
        typeof value === "bigint" ? `${value}n` : value,
      ),
      { "Content-Type": "application/json" },
    );
}

export async function fetchActiveUsms(
  client: AnvilClient,
): Promise<IndexerActiveUsmsResponse["activeUsms"]> {
  const chainId = await client.getChainId();
  const addresses = ADDRESSES[chainId];
  assert(addresses, `Missing addresses for chain id ${chainId}`);
  const usmAddresses = await client.readContract({
    address: addresses.usmRegistry,
    abi: UsmRegistryAbi,
    functionName: "getUsmList",
  });

  const activeUsms = await Promise.all(
    usmAddresses.map(async (usmAddress) => {
      const [
        stableToken,
        underlyingAsset,
        accessMode,
        underlyingExposureCap,
        availableUnderlyingExposure,
        canSwap,
      ] = await Promise.all([
        client.readContract({
          address: usmAddress,
          abi: usmAbi,
          functionName: "STABLE_TOKEN",
        }),
        client.readContract({
          address: usmAddress,
          abi: usmAbi,
          functionName: "UNDERLYING_ASSET",
        }),
        client.readContract({
          address: usmAddress,
          abi: usmAbi,
          functionName: "getAccessMode",
        }),
        client.readContract({
          address: usmAddress,
          abi: usmAbi,
          functionName: "getExposureCap",
        }),
        client.readContract({
          address: usmAddress,
          abi: usmAbi,
          functionName: "getAvailableUnderlyingExposure",
        }),
        client.readContract({
          address: usmAddress,
          abi: usmAbi,
          functionName: "canSwap",
        }),
      ]);

      const stableTokenAddress = getAddress(stableToken);
      const [minterConfig, allowedMinter, allowedBurner] = await Promise.all([
        client.readContract({
          address: stableTokenAddress,
          abi: DusdAbi,
          functionName: "minterConfig",
          args: [usmAddress],
        }),
        client.readContract({
          address: stableTokenAddress,
          abi: DusdAbi,
          functionName: "allowedMinter",
          args: [usmAddress],
        }),
        client.readContract({
          address: stableTokenAddress,
          abi: DusdAbi,
          functionName: "allowedBurner",
          args: [usmAddress],
        }),
      ]);

      return {
        chainId: chainId,
        address: getAddress(usmAddress),
        stableToken: stableTokenAddress,
        underlyingAsset: getAddress(underlyingAsset),
        underlyingExposureCap,
        currentExposure: underlyingExposureCap - availableUnderlyingExposure,
        type: (accessMode === 0 ? "permissionless" : "permissioned") as
          | "permissionless"
          | "permissioned",
        dusdConfig: {
          chainId: chainId,
          minterAddress: getAddress(usmAddress),
          minterStatus: allowedMinter,
          burnerStatus: allowedBurner,
          minterCeiling: minterConfig[1],
          currentlyMinted: minterConfig[0],
        },
        isActive: true,
        swapsFrozen: !canSwap,
      } as IndexerActiveUsmsResponse["activeUsms"][number];
    }),
  );

  return activeUsms.filter(
    (usm) => usm.isActive && usm.type === "permissionless",
  );
}
