import { ponder } from "ponder:registry";
import { liquidationEngine, market } from "ponder:schema";
import { replaceBigInts } from "../utils";

ponder.on(
  "DlbDcfPriorityLiquidationEngine:SetLiquidationConfiguration",
  async ({ context, event }) => {
    const marketExists = await context.db.find(market, {
      chainId: context.chain.id,
      address: event.log.address,
    });
    if (!marketExists) {
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
