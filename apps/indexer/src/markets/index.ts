import { ponder } from "ponder:registry";
import type { Address } from "viem";
import {
  accrueInterest,
  addCollateral,
  addSupply,
  borrow,
  deactivateMarket,
  governanceLiquidation,
  interestFeeAccrued,
  liquidation,
  pauseMarket,
  removeCollateral,
  removeSupply,
  repay,
  setDebtCeiling,
  setFeeRecipient,
  setInterestFee,
  setIrm,
  setLiquidationEngine,
  setOracle,
  setMaxLtv,
  setupMarket,
  shouldIndexMintMarketEvent,
} from "./markets";

type MintMarketEventArgs = {
  event: { log: { address: Address } };
  context: Parameters<typeof shouldIndexMintMarketEvent>[1];
};

const forIndexedMintMarket = <Args extends MintMarketEventArgs>(
  handler: (args: Args) => Promise<void> | void,
) => async (args: Args) => {
  if (await shouldIndexMintMarketEvent(args.event.log.address, args.context)) {
    await handler(args);
  }
};

// Registry events
ponder.on("MarketRegistry:BorrowMarketAdded", setupMarket);
ponder.on("MarketRegistry:MintMarketAdded", setupMarket);
ponder.on("MarketRegistry:BorrowMarketRemoved", deactivateMarket);
ponder.on("MarketRegistry:MintMarketRemoved", async ({ context, event }) => {
  if (await shouldIndexMintMarketEvent(event.args.market, context)) {
    await deactivateMarket({ context, event });
  }
});

// Borrow markets
ponder.on("AltoBorrowMarket:Paused", pauseMarket);
ponder.on("AltoBorrowMarket:AccrueInterest", accrueInterest);
ponder.on("AltoBorrowMarket:AddSupply", addSupply);
ponder.on("AltoBorrowMarket:RemoveSupply", removeSupply);
ponder.on("AltoBorrowMarket:AddCollateral", addCollateral);
ponder.on("AltoBorrowMarket:RemoveCollateral", removeCollateral);
ponder.on("AltoBorrowMarket:Borrow", borrow);
ponder.on("AltoBorrowMarket:Repay", repay);
ponder.on("AltoBorrowMarket:Liquidation", liquidation);
ponder.on("AltoBorrowMarket:SetIrm", setIrm);
ponder.on("AltoBorrowMarket:SetLiquidationEngine", setLiquidationEngine);
ponder.on("AltoBorrowMarket:SetOracle", setOracle);
ponder.on("AltoBorrowMarket:SetMaxLtv", setMaxLtv);
ponder.on("AltoBorrowMarket:GovernanceLiquidation", governanceLiquidation);
ponder.on("AltoBorrowMarket:InterestFeeAccrued", interestFeeAccrued);
ponder.on("AltoBorrowMarket:SetInterestFee", setInterestFee);
ponder.on("AltoBorrowMarket:SetFeeRecipient", setFeeRecipient);

// Mint markets also discover unsupported market types through the registry.
// The wrapper excludes those events before they reach the shared handlers.
ponder.on("AltoMintMarket:Paused", forIndexedMintMarket(pauseMarket));
ponder.on("AltoMintMarket:AccrueInterest", forIndexedMintMarket(accrueInterest));
ponder.on("AltoMintMarket:AddCollateral", forIndexedMintMarket(addCollateral));
ponder.on("AltoMintMarket:RemoveCollateral", forIndexedMintMarket(removeCollateral));
ponder.on("AltoMintMarket:Borrow", forIndexedMintMarket(borrow));
ponder.on("AltoMintMarket:Repay", forIndexedMintMarket(repay));
ponder.on("AltoMintMarket:Liquidation", forIndexedMintMarket(liquidation));
ponder.on("AltoMintMarket:SetIrm", forIndexedMintMarket(setIrm));
ponder.on("AltoMintMarket:SetLiquidationEngine", forIndexedMintMarket(setLiquidationEngine));
ponder.on("AltoMintMarket:SetOracle", forIndexedMintMarket(setOracle));
ponder.on("AltoMintMarket:SetMaxLtv", forIndexedMintMarket(setMaxLtv));
ponder.on("AltoMintMarket:SetDebtCeiling", forIndexedMintMarket(setDebtCeiling));
ponder.on("AltoMintMarket:GovernanceLiquidation", forIndexedMintMarket(governanceLiquidation));
ponder.on("AltoMintMarket:SetFeeRecipient", forIndexedMintMarket(setFeeRecipient));
