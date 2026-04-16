import { ponder } from "ponder:registry";
import { liquidationEngine } from "ponder:schema";
import { replaceBigInts } from "../utils";

ponder.on(
  "DlbDcfPriorityLiquidationEngine:SetLiquidationConfiguration",
  async ({ context, event }) => {
    const leExists = await context.db.find(liquidationEngine, {
      chainId: context.chain.id,
      address: event.log.address,
    });
    if (!leExists) {
      return;
    }
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
