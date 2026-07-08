import {
  ALWAYS_REALIZE_BAD_DEBT,
  chainConfigs,
  type StableRouteMode,
} from "@/config";
import { executorAbi } from "executooor-viem";
import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddressEqual,
  LocalAccount,
  maxUint256,
  parseUnits,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import {
  estimateContractGas,
  getBlock,
  getBlockNumber,
  getGasPrice,
  readContract,
  simulateCalls,
  waitForTransactionReceipt,
  writeContract,
} from "viem/actions";

import type { LiquidityVenue } from "./liquidity-venues/types.js";
import type { Pricer } from "./pricers/types.js";
import {
  planBestConversionRoute,
  planPeripheryUsmRoute,
} from "./utils/conversionRouting.js";
import { CooldownMechanism } from "./utils/cooldownMechanism.js";
import { traceFailedExecution } from "./utils/debugTrace.js";
import { fetchActiveUsms, fetchLiquidatablePositions } from "./utils/fetchers.js";
import { Flashbots } from "./utils/flashbots.js";
import { LiquidationEncoder } from "./utils/LiquidationEncoder.js";
import {
  calculatePositionLtv,
  DEFAULT_LIQUIDATION_BUFFER_BPS,
  formatOraclePrice,
  ORACLE_PRICE_PRECISION,
  WAD,
  wMulDown,
} from "./utils/maths.js";
import type {
  IMarket,
  IndexerAPIResponse,
  IndexerActiveUsmsResponse,
  LiquidatablePosition,
} from "./utils/types.js";

export interface LiquidationBotInputs {
  logTag: string;
  chainId: number;
  client: WalletClient<Transport, Chain, Account>;
  wNative: Address;
  executorAddress: Address;
  usmSellAdapterAddress: Address;
  liquidationPeripheryAddress: Address;
  treasuryAddress: Address;
  liquidityVenues: LiquidityVenue[];
  stableRouteMode: StableRouteMode;
  pricers?: Pricer[];
  cooldownMechanism?: CooldownMechanism;
  flashbotAccount?: LocalAccount;
  isPriorityLiquidator: boolean;
}

type HandleTxResult = "submitted" | "unprofitable" | "simulation_failed";

type ProfitAssetBalance = {
  asset: Address;
  beforeTx: bigint | undefined;
  afterTx: bigint | undefined;
};

export class LiquidationBot {
  private logTag: string;
  private chainId: number;
  private client: WalletClient<Transport, Chain, Account>;
  private wNative: Address;
  private executorAddress: Address;
  private usmSellAdapterAddress: Address;
  private liquidationPeripheryAddress: Address;
  private treasuryAddress: Address;
  private liquidityVenues: LiquidityVenue[];
  private stableRouteMode: StableRouteMode;
  private pricers?: Pricer[];
  private cooldownMechanism?: CooldownMechanism;
  private flashbotAccount?: LocalAccount;
  private isPriorityLiquidator: boolean;
  private tokenDecimalsCache: Map<Address, number> = new Map();
  // Cache for positions skipped as unprofitable: key = "marketId-user", value = { collateral, timestamp }
  private unprofitableCache: Map<
    string,
    { collateral: bigint; timestamp: number }
  > = new Map();
  private isRunning = false;
  private static UNPROFITABLE_COOLDOWN_SEC = 300; // 5 minutes
  private static COLLATERAL_INCREASE_THRESHOLD = 1.2; // 20% increase to re-check

  constructor(inputs: LiquidationBotInputs) {
    this.logTag = inputs.logTag;
    this.chainId = inputs.chainId;
    this.client = inputs.client;
    this.wNative = inputs.wNative;
    this.executorAddress = inputs.executorAddress;
    this.usmSellAdapterAddress = inputs.usmSellAdapterAddress;
    this.liquidationPeripheryAddress = inputs.liquidationPeripheryAddress;
    this.treasuryAddress = inputs.treasuryAddress;
    this.liquidityVenues = inputs.liquidityVenues;
    this.stableRouteMode = inputs.stableRouteMode;
    this.pricers = inputs.pricers;
    this.cooldownMechanism = inputs.cooldownMechanism;
    this.flashbotAccount = inputs.flashbotAccount;
    this.isPriorityLiquidator = inputs.isPriorityLiquidator;
  }

  async run() {
    if (this.isRunning) {
      console.log(`${this.logTag}Previous run still in progress, skipping block`);
      return;
    }

    this.isRunning = true;

    try {
      const liquidationData = await fetchLiquidatablePositions(
        this.chainId,
        this.isPriorityLiquidator,
        this.client.account.address,
      );

      await Promise.all(liquidationData.map((data) => this.handleMarket(data)));
    } finally {
      this.isRunning = false;
    }
  }

  private async handleMarket({ market, positionsLiq }: IndexerAPIResponse) {
    await Promise.all([
      ...positionsLiq.map((position) => this.liquidate(market, position)),
    ]);
  }

  private async liquidate(market: IMarket, position: LiquidatablePosition) {
    const badDebtPosition = position.seizableCollateral === position.collateral;

    // Check if this position was recently skipped as unprofitable
    const cacheKey = `${market.address}-${position.user}`;
    const cached = this.unprofitableCache.get(cacheKey);
    if (cached) {
      const now = Date.now() / 1000;
      const cooldownExpired =
        now > cached.timestamp + LiquidationBot.UNPROFITABLE_COOLDOWN_SEC;
      const collateralIncreased =
        position.collateral >
        (cached.collateral *
          BigInt(
            Math.floor(LiquidationBot.COLLATERAL_INCREASE_THRESHOLD * 100),
          )) /
          100n;

      if (!cooldownExpired && !collateralIncreased) {
        console.log(
          `${this.logTag}Skipping ${position.user} on ${market.address} (cached as unprofitable)`,
        );
        return;
      }
    }

    const minSeizableCollateralUsd =
      chainConfigs[this.chainId]?.options.minSeizableCollateralUsd;
    if (
      !badDebtPosition &&
      minSeizableCollateralUsd !== undefined &&
      minSeizableCollateralUsd > 0
    ) {
      const seizableCollateralUsd =
        this.seizableCollateralValueUsdBaseUnits(position, market);
      const minSeizableCollateralUsdBaseUnits = parseUnits(
        minSeizableCollateralUsd.toString(),
        18,
      );

      if (seizableCollateralUsd < minSeizableCollateralUsdBaseUnits) {
        console.log(
          `${this.logTag}Skipping ${position.user} on ${market.address} (dust: ${this.formatUsdValue(
            seizableCollateralUsd,
          )} < ${this.formatUsdValue(minSeizableCollateralUsdBaseUnits)})`,
        );
        this.unprofitableCache.set(cacheKey, {
          collateral: position.collateral,
          timestamp: Date.now() / 1000,
        });
        return;
      }
    }

    const collateralDecimals = await this.getTokenDecimals(
      market.collateralToken as Address,
    );

    const positionLtv = calculatePositionLtv(
      position.collateral,
      position.borrowShares,
      market.totalBorrowAssets,
      market.totalBorrowShares,
      market.price,
    );

    console.log(
      `${this.logTag}Liquidating ${position.user} on ${market.address}`,
      {
        badDebtPosition,
        oraclePrice: formatOraclePrice(market.price, collateralDecimals),
        positionLtv: `${positionLtv.toFixed(2)}%`,
        seizableCollateral: position.seizableCollateral,
        collateral: position.collateral,
        borrowShares: position.borrowShares,
        totalBorrowAssets: market.totalBorrowAssets,
        totalBorrowShares: market.totalBorrowShares,
      },
    );

    if (!this.checkCooldown(market.address, position.user)) return;

    const { client, executorAddress } = this;

    const encoder = new LiquidationEncoder(executorAddress, client);
    const bufferedSeizableCollateral = this.decreaseSeizableCollateral(
      position.seizableCollateral,
      badDebtPosition,
    );
    const activeUsms =
      this.stableRouteMode === "swap_only"
        ? undefined
        : await this.getActiveUsms();

    let profitAssets: Address[] = [getAddress(market.loanToken)];
    const peripheryProfitAssets =
      this.stableRouteMode === "periphery_usm_then_swap"
        ? await this.convertCollateralViaLiquidationPeriphery(
            market,
            position.user,
            bufferedSeizableCollateral,
            activeUsms,
            encoder,
          )
        : false;

    if (peripheryProfitAssets) {
      profitAssets = peripheryProfitAssets;
    } else {
      if (
        !(await this.convertCollateralToLoanDirect(
          market,
          bufferedSeizableCollateral,
          activeUsms,
          this.directStableRouteMode(),
          encoder,
        ))
      )
        return;

      encoder.erc20Approve(market.loanToken, market.address, maxUint256);
      encoder.altoLiquidate(market, position.user, encoder.flush());
      encoder.erc20Skim(market.loanToken, this.treasuryAddress);
    }

    const calls = encoder.flush();

    try {
      let txResult = await this.handleTx(
        encoder,
        calls,
        badDebtPosition,
        profitAssets,
      );

      if (txResult === "simulation_failed" && peripheryProfitAssets) {
        console.log(
          `${this.logTag}Liquidation periphery simulation failed, trying direct route fallback`,
        );

        const fallbackEncoder = new LiquidationEncoder(executorAddress, client);
        if (
          await this.convertCollateralToLoanDirect(
            market,
            bufferedSeizableCollateral,
            activeUsms,
            "swap_only",
            fallbackEncoder,
          )
        ) {
          fallbackEncoder.erc20Approve(
            market.loanToken,
            market.address,
            maxUint256,
          );
          fallbackEncoder.altoLiquidate(
            market,
            position.user,
            fallbackEncoder.flush(),
          );
          fallbackEncoder.erc20Skim(market.loanToken, this.treasuryAddress);

          txResult = await this.handleTx(
            fallbackEncoder,
            fallbackEncoder.flush(),
            badDebtPosition,
            [getAddress(market.loanToken)],
          );
        }
      }

      if (txResult === "submitted") {
        console.log(
          `${this.logTag}Liquidated ${position.user} on ${market.address}`,
        );
        // Clear from unprofitable cache on success
        this.unprofitableCache.delete(cacheKey);
      } else if (txResult === "unprofitable") {
        console.log(
          `${this.logTag}Skipped ${position.user} on ${market.address} (not profitable)`,
        );
        // Add to unprofitable cache
        this.unprofitableCache.set(cacheKey, {
          collateral: position.collateral,
          timestamp: Date.now() / 1000,
        });
      } else {
        console.log(
          `${this.logTag}Skipped ${position.user} on ${market.address} (simulation failed)`,
        );
      }
    } catch (error) {
      console.error(
        `${this.logTag}Failed to liquidate ${position.user} on ${market.address}`,
        error,
      );
    }
  }

  private async handleTx(
    encoder: LiquidationEncoder,
    calls: Hex[],
    badDebtPosition: boolean,
    profitAssets: Address[],
  ): Promise<HandleTxResult> {
    const functionData = {
      abi: executorAbi,
      functionName: "exec_606BaXt",
      args: [calls],
    } as const;

    const balanceOfCalls = profitAssets.map((asset) => ({
      to: asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [this.treasuryAddress],
    })) as {
      to: Address;
      abi: typeof erc20Abi;
      functionName: "balanceOf";
      args: [Address];
    }[];

    const [{ results }, gasPrice] = await Promise.all([
      simulateCalls(this.client, {
        account: this.client.account.address,
        calls: [
          ...balanceOfCalls,
          { to: encoder.address, ...functionData },
          ...balanceOfCalls,
        ],
      }),
      getGasPrice(this.client),
    ]);

    const executionResult = results[profitAssets.length];

    if (executionResult?.status !== "success") {
      const simulationError = executionResult?.error as
        | { shortMessage?: string }
        | undefined;
      console.log(
        `${this.logTag}Simulation failed:`,
        simulationError?.shortMessage || "unknown error",
      );

      // Only trace failed executions if DEBUG_LIQUIDATION is set to 1
      // Useful for debugging
      if (process.env.DEBUG_LIQUIDATION === "1") {
        await traceFailedExecution({
          client: this.client,
          executorAddress: encoder.address,
          calls,
          logTag: this.logTag,
        });
      }

      return "simulation_failed";
    }

    const profitAssetBalances = profitAssets.map((asset, index) => {
      const beforeResult = results[index];
      const afterResult = results[profitAssets.length + 1 + index];

      return {
        asset,
        beforeTx:
          beforeResult?.status === "success"
            ? (beforeResult.result as bigint)
            : undefined,
        afterTx:
          afterResult?.status === "success"
            ? (afterResult.result as bigint)
            : undefined,
      };
    });

    const isProfitable = await this.checkProfit(
      profitAssetBalances,
      {
        used: executionResult.gasUsed,
        price: gasPrice,
      },
      badDebtPosition,
    );

    if (!isProfitable) {
      return "unprofitable";
    }

    // TX EXECUTION
    if (this.flashbotAccount) {
      const signedBundle = await Flashbots.signBundle([
        {
          transaction: {
            to: encoder.address,
            ...functionData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice / 10n, // 10% priority fee
          },
          client: this.client,
        },
      ]);

      await Flashbots.sendRawBundle(
        signedBundle,
        (await getBlockNumber(this.client)) + 1n,
        this.flashbotAccount,
      );
      return "submitted";
    } else {
      const block = await getBlock(this.client);
      // simulateCalls runs the exec call after the balance probes in the same
      // simulated block, so its gasUsed misses cold-access costs the real tx
      // pays. Take the max with a standalone estimate to avoid on-chain OOG.
      const estimatedGas = await estimateContractGas(this.client, {
        account: this.client.account,
        address: encoder.address,
        ...functionData,
      });
      const maxGas =
        estimatedGas > executionResult.gasUsed
          ? estimatedGas
          : executionResult.gasUsed;
      const bufferedGas = (maxGas * 120n) / 100n;
      const txHash = await writeContract(this.client, {
        address: encoder.address,
        ...functionData,
        gas:
          block.gasLimit > 0n && bufferedGas > block.gasLimit
            ? block.gasLimit
            : bufferedGas,
      });
      const receipt = await waitForTransactionReceipt(this.client, {
        hash: txHash,
      });
      if (receipt.status !== "success") {
        console.warn(`${this.logTag}Transaction reverted: ${txHash}`);
        return "simulation_failed";
      }
      console.log(`${this.logTag}Transaction submitted: ${txHash}`);
    }

    return "submitted";
  }

  private async convertCollateralViaLiquidationPeriphery(
    marketParams: IMarket,
    borrower: Address,
    seizableCollateral: bigint,
    activeUsms: IndexerActiveUsmsResponse["activeUsms"] | undefined,
    encoder: LiquidationEncoder,
  ) {
    const route = await planPeripheryUsmRoute({
      executorAddress: this.executorAddress,
      liquidationPeripheryAddress: this.liquidationPeripheryAddress,
      client: this.client,
      liquidityVenues: this.liquidityVenues,
      activeUsms,
      surplusRecipient: this.treasuryAddress,
      toConvert: {
        src: getAddress(marketParams.collateralToken),
        dst: getAddress(marketParams.loanToken),
        srcAmount: seizableCollateral,
      },
    });

    if (!route.success || !route.usm) {
      for (const error of route.errors) {
        console.error(
          `${this.logTag}Error planning liquidation periphery route for ${marketParams.collateralToken} to ${marketParams.loanToken}: ${error}`,
        );
      }
      return false;
    }

    encoder.altoLiquidationPeripheryLiquidate(
      this.liquidationPeripheryAddress,
      marketParams,
      borrower,
      route.usm.address,
      route.calls,
    );
    encoder.erc20Skim(route.usm.underlyingAsset, this.treasuryAddress);
    encoder.erc20Skim(getAddress(marketParams.loanToken), this.treasuryAddress);

    return this.uniqueAddresses([
      getAddress(marketParams.collateralToken),
      route.usm.underlyingAsset,
      getAddress(marketParams.loanToken),
    ]);
  }

  private async convertCollateralToLoanDirect(
    marketParams: IMarket,
    seizableCollateral: bigint,
    activeUsms: IndexerActiveUsmsResponse["activeUsms"] | undefined,
    stableRouteMode: StableRouteMode,
    encoder: LiquidationEncoder,
  ) {
    const route = await planBestConversionRoute({
      executorAddress: this.executorAddress,
      usmSellAdapterAddress: this.usmSellAdapterAddress,
      client: this.client,
      liquidityVenues: this.liquidityVenues,
      activeUsms,
      stableRouteMode,
      surplusRecipient: this.treasuryAddress,
      toConvert: {
        src: getAddress(marketParams.collateralToken),
        dst: getAddress(marketParams.loanToken),
        srcAmount: seizableCollateral,
      },
    });

    if (!route.success) {
      for (const error of route.errors) {
        console.error(
          `${this.logTag}Error converting ${marketParams.collateralToken} to ${marketParams.loanToken}: ${error}`,
        );
      }
      return false;
    }

    encoder.appendEncodedCalls(route.calls);
    return true;
  }

  private async price(asset: Address, amount: bigint, pricers: Pricer[]) {
    let price: number | undefined = undefined;

    for (const pricer of pricers) {
      price = await pricer.price(this.client, asset);
      if (price !== undefined) break;
    }

    if (price === undefined) return undefined;

    const decimals =
      asset === this.wNative
        ? 18
        : await readContract(this.client, {
            address: asset,
            abi: erc20Abi,
            functionName: "decimals",
          });

    return parseFloat(formatUnits(amount, decimals)) * price;
  }

  private uniqueAddresses(addresses: Address[]) {
    const unique: Address[] = [];
    for (const address of addresses) {
      if (!unique.some((existing) => isAddressEqual(existing, address))) {
        unique.push(address);
      }
    }
    return unique;
  }

  private async checkProfit(
    profitAssetBalances: ProfitAssetBalance[],
    gas: {
      used: bigint;
      price: bigint;
    },
    badDebtPosition: boolean,
  ) {
    if (ALWAYS_REALIZE_BAD_DEBT && badDebtPosition) return true;
    if (this.pricers === undefined) return true;
    const pricers = this.pricers;

    if (profitAssetBalances.length === 0) {
      return false;
    }

    const profitDeltas: { asset: Address; amount: bigint }[] = [];
    for (const balance of profitAssetBalances) {
      if (balance.beforeTx === undefined || balance.afterTx === undefined) {
        return false;
      }

      const profit = balance.afterTx - balance.beforeTx;
      if (profit > 0n) {
        profitDeltas.push({ asset: balance.asset, amount: profit });
      }
    }

    if (profitDeltas.length === 0) {
      return false;
    }

    const [profitValuesUsd, gasUsedUsd] = await Promise.all([
      Promise.all(
        profitDeltas.map((delta) =>
          this.price(delta.asset, delta.amount, pricers),
        ),
      ),
      this.price(this.wNative, gas.used * gas.price, pricers),
    ]);

    const pricedProfitValuesUsd: number[] = [];
    for (const value of profitValuesUsd) {
      if (value === undefined) {
        console.warn(
          `${this.logTag}Unable to price profit or gas; proceeding without USD profitability check`,
        );
        return true;
      }
      pricedProfitValuesUsd.push(value);
    }

    if (gasUsedUsd === undefined) {
      // Deliberately fail open here: temporary pricing outages should not cause
      // missed liquidations or bad debt accumulation. This can allow some
      // unprofitable liquidations during outages, but that is an intentional
      // liveness-over-efficiency tradeoff.
      console.warn(
        `${this.logTag}Unable to price profit or gas; proceeding without USD profitability check`,
      );
      return true;
    }

    let profitUsd = 0;
    for (const value of pricedProfitValuesUsd) {
      profitUsd += value;
    }

    return profitUsd - gasUsedUsd > 0;
  }

  private async getActiveUsms() {
    if (this.stableRouteMode === "swap_only") {
      return undefined;
    }

    try {
      return await fetchActiveUsms(this.chainId);
    } catch (error) {
      console.warn(
        `${this.logTag}Failed to refresh active USMs from indexer, continuing without USM routes`,
        error,
      );
      return undefined;
    }
  }

  private directStableRouteMode(): StableRouteMode {
    return this.stableRouteMode === "public_usm_then_swap"
      ? "public_usm_then_swap"
      : "swap_only";
  }

  private decreaseSeizableCollateral(
    seizableCollateral: bigint,
    _badDebtPosition: boolean,
  ) {
    const liquidationBufferBps =
      chainConfigs[this.chainId]?.options.liquidationBufferBps ??
      DEFAULT_LIQUIDATION_BUFFER_BPS;

    return wMulDown(
      seizableCollateral,
      WAD - parseUnits(liquidationBufferBps.toString(), 14),
    );
  }

  private seizableCollateralValueUsdBaseUnits(
    position: LiquidatablePosition,
    market: IMarket,
  ) {
    return (
      (position.seizableCollateral * market.price) / ORACLE_PRICE_PRECISION
    );
  }

  private formatUsdValue(valueBaseUnits: bigint) {
    const value = Number(formatUnits(valueBaseUnits, 18));
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private checkCooldown(marketId: Hex, account: Address) {
    if (
      this.cooldownMechanism !== undefined &&
      !this.cooldownMechanism.isPositionReady(marketId, account)
    ) {
      return false;
    }
    return true;
  }

  private async getTokenDecimals(token: Address): Promise<number> {
    const cached = this.tokenDecimalsCache.get(token);
    if (cached !== undefined) return cached;

    const decimals = await readContract(this.client, {
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    });

    this.tokenDecimalsCache.set(token, decimals);
    return decimals;
  }
}
