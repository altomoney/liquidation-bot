import { chainConfigs } from "@/config";
import type { Pricer } from "@/pricers";
import type { LiquidatablePosition } from "@/utils/types";
import nock from "nock";
import { erc20Abi, getAddress, parseEventLogs, type Address } from "viem";
import { assert, beforeEach, describe, expect } from "vitest";

import { LiquidationPeriphery } from "@/abis/liquidation-periphery";
import { LiquidationBot } from "@/bot";
import { createLiquidityVenue } from "@/liquidity-venues";
import {
  odosWbtcFrxusdFixture,
  WBTC_ODOS_FORK_BLOCK_NUMBER,
} from "@/test/fixtures/odosWbtcFrxusd";
import {
  buildMockMarketResponse,
  fetchActiveUsms,
  mockIndexerActiveUsms,
  mockIndexerLiquidatablePositions,
  readMarketPosition,
  readMarketState,
  setOraclePrice,
  setupPosition,
} from "@/test/helpers";
import { createExecutionTest } from "@/test/setup";

const LIQUIDATOR_INDEX = 0;
const LIQUIDATEE_INDEX = 1;

const CHAIN_ID = 1;
const MARKET_ADDRESS = "0xefd78a5970a43e25b30426C3952065217c55e5E4";
const FRXUSD_ADDRESS = "0xCAcd6fd266aF91b8AeD52aCCc382b4e165586E29";
const DUSD_ADDRESS = "0x63d74d22E689C715a04F2C13962b1f77F443d35b";
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const executionTest = createExecutionTest(
  CHAIN_ID,
  WBTC_ODOS_FORK_BLOCK_NUMBER,
);

const liquidityVenues = [createLiquidityVenue("odos")];
const testPricer: Pricer = {
  price(_client, asset) {
    switch (asset) {
      case FRXUSD_ADDRESS:
      case DUSD_ADDRESS:
        return 1;
      case WBTC_ADDRESS:
        return 60_000;
      case WETH_ADDRESS:
        return 3_000;
      default:
        return undefined;
    }
  },
};

beforeEach(() => {
  nock.cleanAll();
  nock("https://api.odos.xyz")
    .post("/sor/quote/v3")
    .reply(200, odosWbtcFrxusdFixture.quote)
    .persist();
  nock("https://api.odos.xyz")
    .post("/sor/assemble")
    .reply(200, odosWbtcFrxusdFixture.assembled)
    .persist();
});

describe.sequential("WBTC liquidation fork test", () => {
  executionTest(
    "executes the pinned Odos (WBTC -> frxUSD) -> LiquidationPeriphery -> AdvancedPermissionsUSM route",
    async ({ client, encoder }) => {
      const accounts = await client.getAddresses();
      const liquidator = accounts[LIQUIDATOR_INDEX];
      const borrower = accounts[LIQUIDATEE_INDEX];
      const config = chainConfigs[CHAIN_ID];
      const usmSellAdapterAddress = config?.options.usmSellAdapterAddress;

      assert(config, "Missing chain config");
      assert(usmSellAdapterAddress, "Missing UsmSellAdapter address");
      assert(liquidator, "Missing liquidator account");
      assert(borrower, "Missing borrower account");

      const collateralAmount = 5n * 10n ** 8n; // 5 WBTC
      const { position: initialPosition, marketState } = await setupPosition(
        client,
        {
          marketAddress: MARKET_ADDRESS,
          borrower,
          collateralAmount,
          borrowRatio: 0.1,
        },
      );

      const borrowerPositionAfterSetup = await readMarketPosition(
        client,
        MARKET_ADDRESS,
        borrower,
      );
      expect(borrowerPositionAfterSetup.collateralAssets).toBe(
        collateralAmount,
      );
      expect(borrowerPositionAfterSetup.borrowShares).toBeGreaterThan(0n);

      const originalPrice = marketState.oraclePrice;
      const newPrice = originalPrice / 100n;
      await setOraclePrice(client, marketState.oracle, newPrice);

      const updatedState = await readMarketState(client, MARKET_ADDRESS);
      const activeUsms = await fetchActiveUsms(client);
      const mockMarket = buildMockMarketResponse(
        MARKET_ADDRESS,
        updatedState,
        newPrice,
        CHAIN_ID,
      );

      const mockPosition: LiquidatablePosition = {
        chainId: CHAIN_ID,
        marketId: MARKET_ADDRESS,
        user: borrower,
        supplyShares: initialPosition.supplyShares,
        borrowShares: initialPosition.borrowShares,
        collateral: initialPosition.collateralAssets,
        seizableCollateral: initialPosition.collateralAssets,
      };

      mockIndexerLiquidatablePositions(CHAIN_ID, [
        { market: mockMarket, positionsLiq: [mockPosition] },
      ]);
      mockIndexerActiveUsms(CHAIN_ID, activeUsms);

      const frxusdBefore = await client.readContract({
        address: FRXUSD_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [liquidator],
      });
      const fromBlock = await client.getBlockNumber();

      const bot = new LiquidationBot({
        logTag: "[test-wbtc] ",
        chainId: CHAIN_ID,
        client: client as never,
        wNative: config.wNative,
        executorAddress: encoder.address as Address,
        usmSellAdapterAddress,
        liquidationPeripheryAddress: config.options.liquidationPeripheryAddress,
        treasuryAddress: liquidator,
        liquidityVenues,
        stableRouteMode: "periphery_usm_then_swap",
        isPriorityLiquidator: false,
      });

      await bot.run();

      const finalPosition = await readMarketPosition(
        client,
        MARKET_ADDRESS,
        borrower,
      );

      expect(finalPosition.collateralAssets).toBe(0n);
      expect(finalPosition.borrowShares).toBe(0n);

      const frxusdAfter = await client.readContract({
        address: FRXUSD_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [liquidator],
      });
      expect(frxusdAfter).toBeGreaterThan(frxusdBefore);

      const peripheryLogs = await client.getLogs({
        address: config.options.liquidationPeripheryAddress,
        fromBlock,
        toBlock: "latest",
      });
      const liquidationEvents = parseEventLogs({
        abi: LiquidationPeriphery,
        eventName: "Liquidation",
        logs: peripheryLogs,
      });
      expect(liquidationEvents).toHaveLength(1);
      expect(getAddress(liquidationEvents[0]!.args.market)).toBe(
        getAddress(MARKET_ADDRESS),
      );
      expect(getAddress(liquidationEvents[0]!.args.user)).toBe(
        getAddress(borrower),
      );
      expect(getAddress(liquidationEvents[0]!.args.liquidator)).toBe(
        getAddress(encoder.address as Address),
      );
    },
  );

  executionTest(
    "executes the periphery route with profit checking enabled when profit lands as frxUSD",
    async ({ client, encoder }) => {
      const accounts = await client.getAddresses();
      const liquidator = accounts[LIQUIDATOR_INDEX];
      const borrower = accounts[LIQUIDATEE_INDEX];
      const config = chainConfigs[CHAIN_ID];
      const usmSellAdapterAddress = config?.options.usmSellAdapterAddress;

      assert(config, "Missing chain config");
      assert(usmSellAdapterAddress, "Missing UsmSellAdapter address");
      assert(liquidator, "Missing liquidator account");
      assert(borrower, "Missing borrower account");

      const collateralAmount = 5n * 10n ** 8n; // 5 WBTC
      const { position: initialPosition, marketState } = await setupPosition(
        client,
        {
          marketAddress: MARKET_ADDRESS,
          borrower,
          collateralAmount,
          borrowRatio: 0.1,
        },
      );

      const originalPrice = marketState.oraclePrice;
      const newPrice = originalPrice / 100n;
      await setOraclePrice(client, marketState.oracle, newPrice);

      const updatedState = await readMarketState(client, MARKET_ADDRESS);
      const activeUsms = await fetchActiveUsms(client);
      const mockMarket = buildMockMarketResponse(
        MARKET_ADDRESS,
        updatedState,
        newPrice,
        CHAIN_ID,
      );

      const mockPosition: LiquidatablePosition = {
        chainId: CHAIN_ID,
        marketId: MARKET_ADDRESS,
        user: borrower,
        supplyShares: initialPosition.supplyShares,
        borrowShares: initialPosition.borrowShares,
        collateral: initialPosition.collateralAssets + 1n,
        seizableCollateral: initialPosition.collateralAssets,
      };

      mockIndexerLiquidatablePositions(CHAIN_ID, [
        { market: mockMarket, positionsLiq: [mockPosition] },
      ]);
      mockIndexerActiveUsms(CHAIN_ID, activeUsms);

      const frxusdBefore = await client.readContract({
        address: FRXUSD_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [liquidator],
      });

      const bot = new LiquidationBot({
        logTag: "[test-wbtc-profit] ",
        chainId: CHAIN_ID,
        client: client as never,
        wNative: config.wNative,
        executorAddress: encoder.address as Address,
        usmSellAdapterAddress,
        liquidationPeripheryAddress: config.options.liquidationPeripheryAddress,
        treasuryAddress: liquidator,
        liquidityVenues,
        stableRouteMode: "periphery_usm_then_swap",
        pricers: [testPricer],
        isPriorityLiquidator: false,
      });

      await bot.run();

      const finalPosition = await readMarketPosition(
        client,
        MARKET_ADDRESS,
        borrower,
      );
      const frxusdAfter = await client.readContract({
        address: FRXUSD_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [liquidator],
      });

      expect(finalPosition.collateralAssets).toBe(0n);
      expect(finalPosition.borrowShares).toBe(0n);
      expect(frxusdAfter).toBeGreaterThan(frxusdBefore);
    },
  );
});
