import {
  ALWAYS_REALIZE_BAD_DEBT,
  chainConfigs,
  type UsmMode,
} from "@/config";
import { executorAbi } from "executooor-viem";
import {
  erc20Abi,
  formatUnits,
  getAddress,
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
  getBlockNumber,
  getGasPrice,
  readContract,
  simulateCalls,
  writeContract,
} from "viem/actions";

import type { LiquidityVenue } from "./liquidity-venues/types.js";
import type { Pricer } from "./pricers/types.js";
import { CooldownMechanism } from "./utils/cooldownMechanism.js";
import { fetchLiquidatablePositions } from "./utils/fetchers.js";
import { Flashbots } from "./utils/flashbots.js";
import { planBestConversionRoute } from "./utils/conversionRouting.js";
import { LiquidationEncoder } from "./utils/LiquidationEncoder.js";
import {
  calculatePositionLtv,
  DEFAULT_LIQUIDATION_BUFFER_BPS,
  formatOraclePrice,
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
  treasuryAddress: Address;
  liquidityVenues: LiquidityVenue[];
  activeUsms?: IndexerActiveUsmsResponse["activeUsms"];
  usmMode: UsmMode;
  pricers?: Pricer[];
  cooldownMechanism?: CooldownMechanism;
  flashbotAccount?: LocalAccount;
  isPriorityLiquidator: boolean;
}

export class LiquidationBot {
  private logTag: string;
  private chainId: number;
  private client: WalletClient<Transport, Chain, Account>;
  private wNative: Address;
  private executorAddress: Address;
  private treasuryAddress: Address;
  private liquidityVenues: LiquidityVenue[];
  private activeUsms?: IndexerActiveUsmsResponse["activeUsms"];
  private usmMode: UsmMode;
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
  private static UNPROFITABLE_COOLDOWN_SEC = 300; // 5 minutes
  private static COLLATERAL_INCREASE_THRESHOLD = 1.2; // 20% increase to re-check

  constructor(inputs: LiquidationBotInputs) {
    this.logTag = inputs.logTag;
    this.chainId = inputs.chainId;
    this.client = inputs.client;
    this.wNative = inputs.wNative;
    this.executorAddress = inputs.executorAddress;
    this.treasuryAddress = inputs.treasuryAddress;
    this.liquidityVenues = inputs.liquidityVenues;
    this.activeUsms = inputs.activeUsms;
    this.usmMode = inputs.usmMode;
    this.pricers = inputs.pricers;
    this.cooldownMechanism = inputs.cooldownMechanism;
    this.flashbotAccount = inputs.flashbotAccount;
    this.isPriorityLiquidator = inputs.isPriorityLiquidator;
  }

  async run() {
    const liquidationData = await fetchLiquidatablePositions(
      this.chainId,
      this.isPriorityLiquidator,
      this.client.account.address,
    );

    return Promise.all(liquidationData.map((data) => this.handleMarket(data)));
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

    if (
      !(await this.convertCollateralToLoan(
        market,
        this.decreaseSeizableCollateral(
          position.seizableCollateral,
          badDebtPosition,
        ),
        encoder,
      ))
    )
      return;

    encoder.erc20Approve(market.loanToken, market.address, maxUint256);

    encoder.altoLiquidate(market, position.user, encoder.flush());
    encoder.erc20Skim(market.loanToken, this.treasuryAddress);

    const calls = encoder.flush();

    try {
      const success = await this.handleTx(
        encoder,
        calls,
        market,
        badDebtPosition,
      );

      if (success) {
        console.log(
          `${this.logTag}Liquidated ${position.user} on ${market.address}`,
        );
        // Clear from unprofitable cache on success
        this.unprofitableCache.delete(cacheKey);
      } else {
        console.log(
          `${this.logTag}Skipped ${position.user} on ${market.address} (not profitable)`,
        );
        // Add to unprofitable cache
        this.unprofitableCache.set(cacheKey, {
          collateral: position.collateral,
          timestamp: Date.now() / 1000,
        });
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
    marketParams: IMarket,
    badDebtPosition: boolean,
  ) {
    const functionData = {
      abi: executorAbi,
      functionName: "exec_606BaXt",
      args: [calls],
    } as const;

    const [{ results }, gasPrice] = await Promise.all([
      simulateCalls(this.client, {
        account: this.client.account.address,
        calls: [
          {
            to: marketParams.loanToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [this.client.account.address],
          },
          { to: encoder.address, ...functionData },
          {
            to: marketParams.loanToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [this.client.account.address],
          },
        ],
      }),
      getGasPrice(this.client),
    ]);

    if (results[1].status !== "success") {
      return false;
    }

    const isProfitable = await this.checkProfit(
      marketParams.loanToken,
      {
        beforeTx: results[0].result,
        afterTx: results[2].result,
      },
      {
        used: results[1].gasUsed,
        price: gasPrice,
      },
      badDebtPosition,
    );

    if (!isProfitable) {
      return false;
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

      return await Flashbots.sendRawBundle(
        signedBundle,
        (await getBlockNumber(this.client)) + 1n,
        this.flashbotAccount,
      );
    } else {
      const txHash = await writeContract(this.client, {
        address: encoder.address,
        ...functionData,
      });
      console.log(`${this.logTag}Transaction submitted: ${txHash}`);
    }

    return true;
  }

  private async convertCollateralToLoan(
    marketParams: IMarket,
    seizableCollateral: bigint,
    encoder: LiquidationEncoder,
  ) {
    const route = await planBestConversionRoute({
      executorAddress: this.executorAddress,
      client: this.client,
      liquidityVenues: this.liquidityVenues,
      activeUsms: this.activeUsms,
      usmMode: this.usmMode,
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

  private async checkProfit(
    loanAsset: Address,
    loanAssetBalance: {
      beforeTx: bigint | undefined;
      afterTx: bigint | undefined;
    },
    gas: {
      used: bigint;
      price: bigint;
    },
    badDebtPosition: boolean,
  ) {
    if (ALWAYS_REALIZE_BAD_DEBT && badDebtPosition) return true;
    if (this.pricers === undefined) return true;

    if (
      loanAssetBalance.beforeTx === undefined ||
      loanAssetBalance.afterTx === undefined
    ) {
      return false;
    }

    const loanAssetProfit =
      loanAssetBalance.afterTx - loanAssetBalance.beforeTx;

    if (loanAssetProfit <= 0n) {
      return false;
    }

    const [loanAssetProfitUsd, gasUsedUsd] = await Promise.all([
      this.price(loanAsset, loanAssetProfit, this.pricers),
      this.price(this.wNative, gas.used * gas.price, this.pricers),
    ]);

    if (loanAssetProfitUsd === undefined || gasUsedUsd === undefined) {
      return false;
    }

    const profitUsd = loanAssetProfitUsd - gasUsedUsd;

    return profitUsd > 0;
  }

  private decreaseSeizableCollateral(
    seizableCollateral: bigint,
    badDebtPosition: boolean,
  ) {
    if (badDebtPosition) return seizableCollateral;

    const liquidationBufferBps =
      chainConfigs[this.chainId]?.options.liquidationBufferBps ??
      DEFAULT_LIQUIDATION_BUFFER_BPS;

    return wMulDown(
      seizableCollateral,
      WAD - parseUnits(liquidationBufferBps.toString(), 14),
    );
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
