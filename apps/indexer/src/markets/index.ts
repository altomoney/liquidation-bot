import { ponder } from "ponder:registry";
import {
  accrueInterest,
  addCollateral,
  addSupply,
  borrow,
  governanceLiquidation,
  interestFeeAccrued,
  liquidation,
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
} from "./markets";

ponder.on("AltoBorrowMarket:AccrueInterest", async ({ event, context }) => {
  await accrueInterest({ context, event });
});

ponder.on("AltoMintMarket:AccrueInterest", async ({ event, context }) => {
  await accrueInterest({ context, event });
});

ponder.on("AltoBorrowMarket:AddSupply", async ({ event, context }) => {
  await addSupply({ context, event });
});

ponder.on("AltoBorrowMarket:RemoveSupply", async ({ event, context }) => {
  await removeSupply({ context, event });
});

ponder.on("AltoBorrowMarket:AddCollateral", async ({ event, context }) => {
  await addCollateral({ context, event });
});

ponder.on("AltoMintMarket:AddCollateral", async ({ event, context }) => {
  await addCollateral({ context, event });
});

ponder.on("AltoBorrowMarket:RemoveCollateral", async ({ event, context }) => {
  await removeCollateral({ context, event });
});

ponder.on("AltoMintMarket:RemoveCollateral", async ({ event, context }) => {
  await removeCollateral({ context, event });
});

ponder.on("AltoBorrowMarket:Borrow", async ({ event, context }) => {
  await borrow({ context, event });
});

ponder.on("AltoMintMarket:Borrow", async ({ event, context }) => {
  await borrow({ context, event });
});

ponder.on("AltoBorrowMarket:Repay", async ({ event, context }) => {
  await repay({ context, event });
});

ponder.on("AltoMintMarket:Repay", async ({ event, context }) => {
  await repay({ context, event });
});

ponder.on("AltoBorrowMarket:Liquidation", async ({ event, context }) => {
  await liquidation({ context, event });
});

ponder.on("AltoMintMarket:Liquidation", async ({ event, context }) => {
  await liquidation({ context, event });
});

ponder.on("AltoBorrowMarket:SetIrm", async ({ event, context }) => {
  await setIrm({ context, event });
});

ponder.on("AltoMintMarket:SetIrm", async ({ event, context }) => {
  await setIrm({ context, event });
});

ponder.on(
  "AltoBorrowMarket:SetLiquidationEngine",
  async ({ event, context }) => {
    await setLiquidationEngine({ context, event });
  }
);

ponder.on("AltoMintMarket:SetLiquidationEngine", async ({ event, context }) => {
  await setLiquidationEngine({ context, event });
});

ponder.on("AltoBorrowMarket:SetOracle", async ({ event, context }) => {
  await setOracle({ context, event });
});

ponder.on("AltoMintMarket:SetOracle", async ({ event, context }) => {
  await setOracle({ context, event });
});

ponder.on("AltoBorrowMarket:SetMaxLtv", async ({ event, context }) => {
  await setMaxLtv({ context, event });
});

ponder.on("AltoMintMarket:SetMaxLtv", async ({ event, context }) => {
  await setMaxLtv({ context, event });
});

ponder.on("AltoMintMarket:SetDebtCeiling", async ({ event, context }) => {
  await setDebtCeiling({ context, event });
});

ponder.on(
  "AltoBorrowMarket:GovernanceLiquidation",
  async ({ event, context }) => {
    await governanceLiquidation({ context, event });
  }
);

ponder.on(
  "AltoMintMarket:GovernanceLiquidation",
  async ({ event, context }) => {
    await governanceLiquidation({ context, event });
  }
);

ponder.on(
  "AltoBorrowMarket:InterestFeeAccrued",
  async ({ event, context }) => {
    await interestFeeAccrued({ context, event });
  }
);

ponder.on(
  "AltoBorrowMarket:SetInterestFee",
  async ({ event, context }) => {
    await setInterestFee({ context, event });
  }
);

ponder.on(
  "AltoBorrowMarket:SetFeeRecipient",
  async ({ event, context }) => {
    await setFeeRecipient({ context, event });
  }
);

ponder.on(
  "AltoMintMarket:SetFeeRecipient",
  async ({ event, context }) => {
    await setFeeRecipient({ context, event });
  }
);
