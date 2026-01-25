import { ponder } from "ponder:registry";
import { irm } from "ponder:schema";
import { replaceBigInts } from "../utils";

ponder.on("AdaptiveCurveIrm:IRStateUpdated", async ({ context, event }) => {
  // event.log.address is the IRM contract address
  // Check if this IRM is tracked in our database
  const irmExists = await context.db.find(irm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!irmExists) {
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
  // event.log.address is the IRM contract address
  const irmExists = await context.db.find(irm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!irmExists) {
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
  // event.log.address is the IRM contract address
  const irmExists = await context.db.find(irm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!irmExists) {
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
