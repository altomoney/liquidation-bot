import { chainConfigs } from "@/config";
import type { LiquidatablePosition } from "@/utils/types";
import nock from "nock";
import type { Address } from "viem";
import { assert, beforeEach, describe, expect } from "vitest";

import { LiquidationBot } from "@/bot";
import { createLiquidityVenue } from "@/liquidity-venues";
import {
  oneInchRethUsdcFixture,
  RETH_ONE_INCH_FORK_BLOCK_NUMBER,
} from "@/test/fixtures/oneInchRethUsdc";
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
const MARKET_ADDRESS = "0xc0E2DdB06bB034c1F980531EC5CAd944D71AfFbf";

const executionTest = createExecutionTest(
  CHAIN_ID,
  RETH_ONE_INCH_FORK_BLOCK_NUMBER,
);

const liquidityVenues = [createLiquidityVenue("1inch")];

beforeEach(() => {
  nock.cleanAll();
  nock("https://api.1inch.dev")
    .get("/swap/v6.1/1/swap")
    .query(true)
    .reply(200, oneInchRethUsdcFixture.swap);
});

describe.sequential("rETH liquidation fork test (1inch)", () => {
  executionTest(
    "executes the pinned 1inch -> UsmVenue route via the deployed adapter",
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

      const collateralAmount = 5n * 10n ** 18n; // 5 rETH
      const bufferedSwapAmount = (collateralAmount * 995n) / 1000n;
      console.log(
        "[test-reth-1inch] Fixture swap",
        `${bufferedSwapAmount.toString()} -> ${oneInchRethUsdcFixture.dstAmount} USDC units`,
      );

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
        logTag: "[test-reth-1inch] ",
        chainId: CHAIN_ID,
        client: client as never,
        wNative: config.wNative,
        executorAddress: encoder.address as Address,
        usmSellAdapterAddress,
        treasuryAddress: liquidator,
        liquidityVenues,
        usmMode: "always",
        isPriorityLiquidator: false,
      });

      await bot.run();

      const finalPosition = await readMarketPosition(
        client,
        MARKET_ADDRESS,
        borrower,
      );

      expect(finalPosition.collateralAssets).toBeLessThanOrEqual(10n);
      expect(finalPosition.borrowShares).toBeLessThan(
        borrowerPositionAfterSetup.borrowShares,
      );
    },
  );
});
