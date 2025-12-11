import { ponder } from "ponder:registry";
import { dusdConfig } from "ponder:schema";
import { zeroAddress } from "viem";

ponder.on("Dusd:SetMinterStatus", async ({ context, event }) => {
  await context.db
    .insert(dusdConfig)
    .values({
      chainId: context.chain.id,
      minterAddress: event.args._for,
    })
    .onConflictDoUpdate((row) => ({
      minterStatus: event.args._status,
    }));
});

ponder.on("Dusd:SetBurnerStatus", async ({ context, event }) => {
  await context.db
    .insert(dusdConfig)
    .values({
      chainId: context.chain.id,
      minterAddress: event.args._for,
    })
    .onConflictDoUpdate((row) => ({
      burnerStatus: event.args._status,
    }));
});

ponder.on("Dusd:SetMinterCeiling", async ({ context, event }) => {
  await context.db
    .insert(dusdConfig)
    .values({
      chainId: context.chain.id,
      minterAddress: event.args._for,
    })
    .onConflictDoUpdate((row) => ({
      minterCeiling: event.args._ceiling,
    }));
});

ponder.on("Dusd:Transfer", async ({ context, event }) => {
  if (event.args.from !== zeroAddress && event.args.to !== zeroAddress) {
    return;
  }
  const isMint = event.args.from === zeroAddress;
  const otherSide = isMint ? event.args.to : event.args.from;
  const amount = isMint ? event.args.value : -event.args.value;
  await context.db
    .insert(dusdConfig)
    .values({
      chainId: context.chain.id,
      minterAddress: otherSide,
    })
    .onConflictDoUpdate((row) => ({
      currentlyMinted: row.currentlyMinted + amount,
    }));
});
