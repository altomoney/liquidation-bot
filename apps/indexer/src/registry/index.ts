import { ponder } from "ponder:registry";
import { deactivateMarket, setupMarket } from "../markets/markets";

ponder.on("MarketRegistry:BorrowMarketAdded", async ({ context, event }) => {
  await setupMarket("AltoBorrowMarket")({ context, event });
});

ponder.on("MarketRegistry:MintMarketAdded", async ({ context, event }) => {
  await setupMarket("AltoMintMarket")({ context, event });
});

ponder.on("MarketRegistry:BorrowMarketRemoved", async ({ context, event }) => {
  await deactivateMarket({ context, event });
});

ponder.on("MarketRegistry:MintMarketRemoved", async ({ context, event }) => {
  await deactivateMarket({ context, event });
});
