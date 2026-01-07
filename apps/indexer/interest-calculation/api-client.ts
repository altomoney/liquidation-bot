import { Hex } from "viem";
import { MarketInfo, MarketState, MarketType, PositionState } from "./types";

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  private async fetch<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get market info (type, tokens, etc.)
   */
  async getMarketInfo(
    chainId: number,
    marketAddress: Hex
  ): Promise<MarketInfo | null> {
    const result = await this.fetch<{
      chainId: number;
      address: Hex;
      type: MarketType;
      loanToken: Hex;
      collateralToken: Hex;
    } | null>(`/chain/${chainId}/market/${marketAddress}/info`);

    if (!result) {
      return null;
    }

    return {
      chainId: result.chainId,
      address: result.address,
      type: result.type,
      loanToken: result.loanToken,
      collateralToken: result.collateralToken,
    };
  }

  /**
   * Get the market state at or before a specific block.
   */
  async getMarketStateAtBlock(
    chainId: number,
    marketAddress: Hex,
    blockNumber: bigint
  ): Promise<MarketState> {
    const result = await this.fetch<{
      chainId: number;
      address: Hex;
      blockNumber: string;
      totalSupplyAssets: string;
      totalSupplyShares: string;
      totalBorrowAssets: string;
      totalBorrowShares: string;
    }>(
      `/chain/${chainId}/market/${marketAddress}/state-at-block/${blockNumber}`
    );

    return {
      chainId: result.chainId,
      address: result.address,
      blockNumber: BigInt(result.blockNumber),
      totalSupplyAssets: BigInt(result.totalSupplyAssets),
      totalSupplyShares: BigInt(result.totalSupplyShares),
      totalBorrowAssets: BigInt(result.totalBorrowAssets),
      totalBorrowShares: BigInt(result.totalBorrowShares),
    };
  }

  /**
   * Get all users with positions in a market up to a given block.
   */
  async getAllUsersWithPositions(
    chainId: number,
    marketAddress: Hex,
    endBlock: bigint
  ): Promise<Hex[]> {
    const result = await this.fetch<{ users: Hex[] }>(
      `/chain/${chainId}/market/${marketAddress}/users/${endBlock}`
    );

    return result.users;
  }

  /**
   * Get a user's position state at or before a specific block.
   */
  async getPositionStateAtBlock(
    chainId: number,
    marketAddress: Hex,
    user: Hex,
    blockNumber: bigint
  ): Promise<PositionState> {
    const result = await this.fetch<{
      chainId: number;
      marketId: Hex;
      user: Hex;
      blockNumber: string;
      supplyShares: string;
      borrowShares: string;
      collateral: string;
    }>(
      `/chain/${chainId}/market/${marketAddress}/user/${user}/position-at-block/${blockNumber}`
    );

    return {
      chainId: result.chainId,
      marketId: result.marketId,
      user: result.user,
      blockNumber: BigInt(result.blockNumber),
      supplyShares: BigInt(result.supplyShares),
      borrowShares: BigInt(result.borrowShares),
      collateral: BigInt(result.collateral),
    };
  }

  /**
   * Get a user's first supply position in a market.
   */
  async getFirstSupplyPositionForUser(
    chainId: number,
    marketAddress: Hex,
    user: Hex
  ): Promise<PositionState | null> {
    const result = await this.fetch<{
      chainId: number;
      marketId: Hex;
      user: Hex;
      blockNumber: string;
      supplyShares: string;
      borrowShares: string;
      collateral: string;
    } | null>(
      `/chain/${chainId}/market/${marketAddress}/user/${user}/first-supply-position`
    );

    if (!result) {
      return null;
    }

    return {
      chainId: result.chainId,
      marketId: result.marketId,
      user: result.user,
      blockNumber: BigInt(result.blockNumber),
      supplyShares: BigInt(result.supplyShares),
      borrowShares: BigInt(result.borrowShares),
      collateral: BigInt(result.collateral),
    };
  }

  /**
   * Get a user's first borrow position in a market.
   */
  async getFirstBorrowPositionForUser(
    chainId: number,
    marketAddress: Hex,
    user: Hex
  ): Promise<PositionState | null> {
    const result = await this.fetch<{
      chainId: number;
      marketId: Hex;
      user: Hex;
      blockNumber: string;
      supplyShares: string;
      borrowShares: string;
      collateral: string;
    } | null>(
      `/chain/${chainId}/market/${marketAddress}/user/${user}/first-borrow-position`
    );

    if (!result) {
      return null;
    }

    return {
      chainId: result.chainId,
      marketId: result.marketId,
      user: result.user,
      blockNumber: BigInt(result.blockNumber),
      supplyShares: BigInt(result.supplyShares),
      borrowShares: BigInt(result.borrowShares),
      collateral: BigInt(result.collateral),
    };
  }

  /**
   * Get all position history entries for a user within a block range.
   */
  async getPositionHistoryForUser(
    chainId: number,
    marketAddress: Hex,
    user: Hex,
    startBlock: bigint,
    endBlock: bigint
  ): Promise<PositionState[]> {
    const result = await this.fetch<
      Array<{
        chainId: number;
        marketId: Hex;
        user: Hex;
        blockNumber: string;
        supplyShares: string;
        borrowShares: string;
        collateral: string;
      }>
    >(
      `/chain/${chainId}/market/${marketAddress}/user/${user}/history/${startBlock}/${endBlock}`
    );

    return result.map((r) => ({
      chainId: r.chainId,
      marketId: r.marketId,
      user: r.user,
      blockNumber: BigInt(r.blockNumber),
      supplyShares: BigInt(r.supplyShares),
      borrowShares: BigInt(r.borrowShares),
      collateral: BigInt(r.collateral),
    }));
  }

  /**
   * Get market state at or after a specific block.
   */
  async getMarketStateAtOrAfterBlock(
    chainId: number,
    marketAddress: Hex,
    blockNumber: bigint
  ): Promise<MarketState | null> {
    const result = await this.fetch<{
      chainId: number;
      address: Hex;
      blockNumber: string;
      totalSupplyAssets: string;
      totalSupplyShares: string;
      totalBorrowAssets: string;
      totalBorrowShares: string;
    } | null>(
      `/chain/${chainId}/market/${marketAddress}/state-at-or-after-block/${blockNumber}`
    );

    if (!result) {
      return null;
    }

    return {
      chainId: result.chainId,
      address: result.address,
      blockNumber: BigInt(result.blockNumber),
      totalSupplyAssets: BigInt(result.totalSupplyAssets),
      totalSupplyShares: BigInt(result.totalSupplyShares),
      totalBorrowAssets: BigInt(result.totalBorrowAssets),
      totalBorrowShares: BigInt(result.totalBorrowShares),
    };
  }
}

