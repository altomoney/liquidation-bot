import { ponder } from "ponder:registry";
import { irm, market } from "ponder:schema";
import { replaceBigInts } from "../utils";

ponder.on("AdaptiveCurveIrm:IRStateUpdated", async ({ context, event }) => {
  const marketExists = await context.db.find(market, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!marketExists) {
    return;
  }
  await context.db
    .update(irm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      state: replaceBigInts({
        rateAtTarget: event.args.newIRState.rateAtTarget,
        lastUpdate: BigInt(event.args.newIRState.lastUpdate),
      }),
    }));
});

ponder.on("AdaptiveCurveIrm:SetIrmConfig", async ({ context, event }) => {
  const marketExists = await context.db.find(market, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!marketExists) {
    return;
  }
  await context.db
    .update(irm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      config: replaceBigInts(event.args.irmConfig),
    }));
});

ponder.on("FixedRateIrm:IRStateUpdated", async ({ context, event }) => {
  const marketExists = await context.db.find(market, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!marketExists) {
    return;
  }
  await context.db
    .update(irm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      state: replaceBigInts({
        borrowRate: event.args.newIRState.borrowRate,
        lastUpdate: BigInt(event.args.newIRState.lastUpdate),
      }),
    }));
});
