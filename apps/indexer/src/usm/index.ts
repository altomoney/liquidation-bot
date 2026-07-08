import { ponder } from "ponder:registry";
import { dusdConfig, usm } from "ponder:schema";
import { AdvancedPermissionsUSM } from "../../abis/AdvancedPermissionsUsmAbi";
import { DusdAbi } from "../../abis/DusdAbi";
import { DusdUsmAbi } from "../../abis/DusdUsmAbi";

type UsmImplementation = "standard" | "advanced_permissions";
type UsmType = "permissioned" | "permissionless";

type UsmSnapshot = {
  stableToken: `0x${string}`;
  underlyingAsset: `0x${string}`;
  type: UsmType;
  implementation: UsmImplementation;
  underlyingExposureCap: bigint;
};

type ReadUsmSnapshotOptions = {
  implementation?: UsmImplementation;
  type?: UsmType;
  underlyingExposureCap?: bigint;
};

type MulticallResult<T> =
  | {
      status: "success";
      result: T;
    }
  | {
      status: "failure";
      error?: unknown;
    };

const isSuccess = <T>(
  result: MulticallResult<T>,
): result is Extract<MulticallResult<T>, { status: "success" }> =>
  result.status === "success";

const requireResult = <T>(
  result: MulticallResult<T>,
  label: string,
  address: `0x${string}`,
): T => {
  if (isSuccess(result)) {
    return result.result;
  }

  throw new Error(`Failed to read ${label} for USM ${address}`);
};

const standardUsmType = (accessMode: number): UsmType =>
  accessMode === 0 ? "permissionless" : "permissioned";

const advancedPermissionsUsmType = (sellAccess: number): UsmType =>
  sellAccess === 1 ? "permissionless" : "permissioned";

const readUsmSnapshot = async (
  context: any,
  address: `0x${string}`,
  options: ReadUsmSnapshotOptions = {},
): Promise<UsmSnapshot> => {
  const [
    stableTokenResult,
    underlyingAssetResult,
    exposureCapResult,
    accessModeResult,
    sellAccessResult,
  ] = (await context.client.multicall({
    allowFailure: true,
    contracts: [
      {
        abi: DusdUsmAbi,
        functionName: "STABLE_TOKEN",
        address,
      },
      {
        abi: DusdUsmAbi,
        functionName: "UNDERLYING_ASSET",
        address,
      },
      {
        abi: DusdUsmAbi,
        functionName: "getExposureCap",
        args: [],
        address,
      },
      {
        abi: DusdUsmAbi,
        functionName: "getAccessMode",
        args: [],
        address,
      },
      {
        abi: AdvancedPermissionsUSM,
        functionName: "getSellAccess",
        args: [],
        address,
      },
    ],
  })) as [
    MulticallResult<`0x${string}`>,
    MulticallResult<`0x${string}`>,
    MulticallResult<bigint>,
    MulticallResult<number>,
    MulticallResult<number>,
  ];

  const stableToken = requireResult(stableTokenResult, "stable token", address);
  const underlyingAsset = requireResult(
    underlyingAssetResult,
    "underlying asset",
    address,
  );
  const exposureCap = requireResult(
    exposureCapResult,
    "exposure cap",
    address,
  );

  const implementation =
    options.implementation ??
    (isSuccess(accessModeResult)
      ? "standard"
      : isSuccess(sellAccessResult)
        ? "advanced_permissions"
        : undefined);

  if (implementation === undefined) {
    throw new Error(`Unable to determine USM implementation for ${address}`);
  }

  const type =
    options.type ??
    (implementation === "standard"
      ? standardUsmType(
          requireResult(accessModeResult, "standard access mode", address),
        )
      : advancedPermissionsUsmType(
          requireResult(sellAccessResult, "advanced sell access", address),
        ));

  return {
    stableToken,
    underlyingAsset,
    type,
    implementation,
    underlyingExposureCap: options.underlyingExposureCap ?? exposureCap,
  };
};

const upsertUsmSnapshot = async (
  context: any,
  address: `0x${string}`,
  snapshot: UsmSnapshot,
) => {
  const dusdMinterConfig = await context.client.readContract({
    abi: DusdAbi,
    address: snapshot.stableToken,
    functionName: "minterConfig",
    args: [address],
  });

  const isBurnerAllowed = await context.client.readContract({
    abi: DusdAbi,
    address: snapshot.stableToken,
    functionName: "allowedBurner",
    args: [address],
  });

  const isMinterAllowed = await context.client.readContract({
    abi: DusdAbi,
    address: snapshot.stableToken,
    functionName: "allowedMinter",
    args: [address],
  });

  await context.db
    .insert(dusdConfig)
    .values({
      chainId: context.chain.id,
      minterAddress: address,
      minterStatus: isMinterAllowed,
      burnerStatus: isBurnerAllowed,
      minterCeiling: dusdMinterConfig[1],
      currentlyMinted: dusdMinterConfig[0],
    })
    .onConflictDoUpdate(() => ({
      minterStatus: isMinterAllowed,
      burnerStatus: isBurnerAllowed,
      minterCeiling: dusdMinterConfig[1],
      currentlyMinted: dusdMinterConfig[0],
    }));

  await context.db
    .insert(usm)
    .values({
      chainId: context.chain.id,
      address,
      stableToken: snapshot.stableToken,
      underlyingAsset: snapshot.underlyingAsset,
      type: snapshot.type,
      implementation: snapshot.implementation,
      underlyingExposureCap: snapshot.underlyingExposureCap,
      dusdConfig: address,
    })
    .onConflictDoUpdate(() => ({
      stableToken: snapshot.stableToken,
      underlyingAsset: snapshot.underlyingAsset,
      type: snapshot.type,
      implementation: snapshot.implementation,
      underlyingExposureCap: snapshot.underlyingExposureCap,
      dusdConfig: address,
      isActive: true,
    }));
};

ponder.on("Usm:AccessModeUpdated", async ({ context, event }) => {
  const hasUsm = await context.db.find(usm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!hasUsm) {
    await upsertUsmSnapshot(
      context,
      event.log.address,
      await readUsmSnapshot(context, event.log.address, {
        implementation: "standard",
        type: standardUsmType(event.args.accessMode),
      }),
    );
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
      type: standardUsmType(event.args.accessMode),
    }));
});

ponder.on("Usm:ExposureCapUpdated", async ({ context, event }) => {
  const hasUsm = await context.db.find(usm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!hasUsm) {
    await upsertUsmSnapshot(
      context,
      event.log.address,
      await readUsmSnapshot(context, event.log.address, {
        underlyingExposureCap: event.args.newExposureCap,
      }),
    );
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

ponder.on("AdvancedPermissionsUsm:AccessConfigUpdated", async ({
  context,
  event,
}) => {
  const hasUsm = await context.db.find(usm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (!hasUsm) {
    await upsertUsmSnapshot(
      context,
      event.log.address,
      await readUsmSnapshot(context, event.log.address, {
        implementation: "advanced_permissions",
        type: advancedPermissionsUsmType(event.args.sellAccess),
      }),
    );
    return;
  }
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set(() => ({
      type: advancedPermissionsUsmType(event.args.sellAccess),
      implementation: "advanced_permissions",
    }));
});

ponder.on("AdvancedPermissionsUsm:Initialized", async ({ context, event }) => {
  const hasUsm = await context.db.find(usm, {
    chainId: context.chain.id,
    address: event.log.address,
  });
  if (hasUsm) {
    return;
  }

  await upsertUsmSnapshot(
    context,
    event.log.address,
    await readUsmSnapshot(context, event.log.address),
  );
});

ponder.on("UsmRegistry:UsmAdded", async ({ context, event }) => {
  await upsertUsmSnapshot(
    context,
    event.args.usm,
    await readUsmSnapshot(context, event.args.usm),
  );
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

ponder.on("Usm:BuyAsset", async ({ context, event }) => {
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      currentExposure: row.currentExposure - event.args.underlyingAmount,
    }));
});

ponder.on("Usm:SellAsset", async ({ context, event }) => {
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      currentExposure: row.currentExposure + event.args.underlyingAmount,
    }));
});

ponder.on("Usm:Seized", async ({ context, event }) => {
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      currentExposure: 0n,
    }));
});

ponder.on("Usm:SwapFreeze", async ({ context, event }) => {
  await context.db
    .update(usm, {
      chainId: context.chain.id,
      address: event.log.address,
    })
    .set((row) => ({
      swapsFrozen: event.args.enabled,
    }));
});
