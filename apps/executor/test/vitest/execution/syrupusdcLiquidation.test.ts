import { chainConfigs } from "@/config";
import type { LiquidatablePosition } from "@/utils/types";
import nock from "nock";
import type { Address } from "viem";
import { assert, beforeEach, describe, expect } from "vitest";

import { LiquidationBot } from "@/bot";
import { createLiquidityVenue } from "@/liquidity-venues";
import {
  odosSyrupusdcUsdcFixture,
  SYRUPUSDC_ODOS_FORK_BLOCK_NUMBER,
} from "@/test/fixtures/odosSyrupusdcUsdc";
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
const MARKET_ADDRESS = "0x33b24510233281350bf8679a7c427d04db0ed208";

const executionTest = createExecutionTest(
  CHAIN_ID,
  SYRUPUSDC_ODOS_FORK_BLOCK_NUMBER,
);

const liquidityVenues = [createLiquidityVenue("odos")];

beforeEach(() => {
  nock.cleanAll();
  nock("https://api.odos.xyz")
    .post("/sor/quote/v3")
    .reply(200, odosSyrupusdcUsdcFixture.quote);
  nock("https://api.odos.xyz")
    .post("/sor/assemble")
    .reply(200, odosSyrupusdcUsdcFixture.assembled);
});

describe.sequential("syrupUSDC liquidation fork test", () => {
  executionTest(
    "executes the pinned Odos -> UsmVenue route via the deployed adapter",
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

      const collateralAmount = 10_000n * 10n ** 6n; // 10k syrupUSDC (6 decimals)
      const { position: initialPosition, marketState } = await setupPosition(
        client,
        {
          marketAddress: MARKET_ADDRESS,
          borrower,
          collateralAmount,
          borrowRatio: 0.9,
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
      const newPrice = originalPrice / 10n;
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

      const bot = new LiquidationBot({
        logTag: "[test-syrupusdc] ",
        chainId: CHAIN_ID,
        client: client as never,
        wNative: config.wNative,
        executorAddress: encoder.address as Address,
        usmSellAdapterAddress,
        liquidationPeripheryAddress: config.options.liquidationPeripheryAddress,
        treasuryAddress: liquidator,
        liquidityVenues,
        stableRouteMode: "public_usm_then_swap",
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
    },
  );
});
