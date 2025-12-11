import { ponder } from "ponder:registry";
import { dusdConfig, usm } from "ponder:schema";
import { DusdAbi } from "../../abis/DusdAbi";
import { DusdUsmAbi } from "../../abis/DusdUsmAbi";

ponder.on("Usm:AccessModeUpdated", async ({ context, event }) => {
  const hasUsm = await context.db.find(usm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!hasUsm) {
    return;
  }
  /**
    enum AccessMode {
        PERMISSIONLESS, 0 
        PERMISSIONED 1
    }
     */
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      type: event.args.accessMode === 0 ? "permissionless" : "permissioned",
    }));
});

ponder.on("Usm:ExposureCapUpdated", async ({ context, event }) => {
  const hasUsm = await context.db.find(usm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!hasUsm) {
    return;
  }
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      underlyingExposureCap: event.args.newExposureCap,
    }));
});

ponder.on("UsmRegistry:UsmAdded", async ({ context, event }) => {
  const stableToken = await context.client.readContract({
    abi: DusdUsmAbi,
    functionName: "STABLE_TOKEN",
    address: event.args.usm,
  });
  const underlyingAsset = await context.client.readContract({
    abi: DusdUsmAbi,
    functionName: "UNDERLYING_ASSET",
    address: event.args.usm,
  });

  const type = await context.client.readContract({
    abi: DusdUsmAbi,
    functionName: "getAccessMode",
    args: [],
    address: event.args.usm,
  });

  const exposureCap = await context.client.readContract({
    abi: DusdUsmAbi,
    functionName: "getExposureCap",
    args: [],
    address: event.args.usm,
  });

  const dusdMinterConfig = await context.client.readContract({
    abi: DusdAbi,
    address: stableToken,
    functionName: "minterConfig",
    args: [event.args.usm],
  });

  const minted = dusdMinterConfig[0];
  const minterCeiling = dusdMinterConfig[1];

  const isBurnerAllowed = await context.client.readContract({
    abi: DusdAbi,
    address: stableToken,
    functionName: "allowedBurner",
    args: [event.args.usm],
  });

  const isMinterAllowed = await context.client.readContract({
    abi: DusdAbi,
    address: stableToken,
    functionName: "allowedMinter",
    args: [event.args.usm],
  });

  await context.db
    .insert(dusdConfig)
    .values({
      chainId: context.chain.id,
      minterAddress: event.args.usm,
      minterStatus: isMinterAllowed,
      burnerStatus: isBurnerAllowed,
      minterCeiling: minterCeiling,
      currentlyMinted: minted,
    })
    .onConflictDoUpdate((row) => ({
      minterStatus: isMinterAllowed,
      burnerStatus: isBurnerAllowed,
      minterCeiling: minterCeiling,
      currentlyMinted: minted,
    }));

  await context.db.insert(usm).values({
    chainId: context.chain.id,
    address: event.args.usm,
    stableToken: stableToken,
    underlyingAsset: underlyingAsset,
    type: type === 0 ? "permissionless" : "permissioned",
    underlyingExposureCap: exposureCap,
    dusdConfig: event.args.usm,
  });
});

ponder.on("UsmRegistry:UsmRemoved", async ({ context, event }) => {
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.args.usm,
    })
    .set((row) => ({
      isActive: false,
    }));
});
