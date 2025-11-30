import { ponder } from "ponder:registry";
import { liquidationEngine } from "ponder:schema";
import { replaceBigInts } from "../utils";

ponder.on(
  "DlbDcfPriorityLiquidationEngine:SetLiquidationConfiguration",
  async ({ context, event }) => {
    await context.db
      .update(liquidationEngine, {
        chainId: context.chain.id,
        address: event.log.address,
      })
      .set((row) => ({
        config: replaceBigInts(event.args.newLiquidationConfiguration),
      }));
  }
);
