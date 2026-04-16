import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readContract } from "viem/actions";
import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import type { UsmMode } from "../../config";
import type { IndexerActiveUsmsResponse } from "../../src/utils/types";
import { ADDRESSES } from "../constants";

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const { chainConfigs } = await import("../../config/config");
const { createLiquidityVenue } = await import("../../src/liquidity-venues");
const { createPricer } = await import("../../src/pricers");
const { usmAbi } = await import("../../src/abis/usm");
const { planBestConversionRoute } =
  await import("../../src/utils/conversionRouting");
const { DusdAbi } = await import("../../../indexer/abis/DusdAbi");
const { UsmRegistryAbi } = await import("../../../indexer/abis/UsmRegistryAbi");

const MAINNET_RPC_URL =
  process.env.RPC_URL_1 ??
  process.env.PONDER_RPC_URL ??
  mainnet.rpcUrls.default.http[0];

const USM_REGISTRY_ADDRESS = getAddress(ADDRESSES[1]!.usmRegistry);

const TEST_PRIVATE_KEY =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

// Update these two addresses when you want to inspect a different pair.
const COLLATERAL_TOKEN = getAddress(
  process.env.ROUTE_TEST_COLLATERAL_TOKEN ??
    "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
);
const LOAN_TOKEN = getAddress(
  process.env.ROUTE_TEST_LOAN_TOKEN ??
    "0x63d74d22E689C715a04F2C13962b1f77F443d35b", // DUSD
);

const TARGET_USD_NOTIONALS = [1_000, 100_000, 1_000_000] as const;

const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const client = createWalletClient({
  account,
  chain: mainnet,
  transport: http(MAINNET_RPC_URL),
});

const mainnetConfig = chainConfigs[mainnet.id];
if (!mainnetConfig) {
  throw new Error("Mainnet config is not defined");
}

const TEST_USM_MODE = (process.env.ROUTE_TEST_USM_MODE ??
  mainnetConfig.options.useUsm ??
  "never") as UsmMode;

const venues = mainnetConfig.options.liquidityVenues.map((liquidityVenueName) =>
  createLiquidityVenue(liquidityVenueName),
);
const pricers = (mainnetConfig.options.pricers ?? []).map((pricerName) =>
  createPricer(pricerName),
);
const fallbackPricers = [createPricer("stablecoin")];

const decimalsCache = new Map<Address, number>();
const symbolCache = new Map<Address, string>();
const priceCache = new Map<Address, number>();

async function readTokenSymbol(token: Address) {
  if (symbolCache.has(token)) {
    return symbolCache.get(token)!;
  }

  try {
    const symbol = await readContract(client, {
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    });
    symbolCache.set(token, symbol);
    return symbol;
  } catch {
    const fallback = token;
    symbolCache.set(token, fallback);
    return fallback;
  }
}

async function readTokenDecimals(token: Address) {
  if (decimalsCache.has(token)) {
    return decimalsCache.get(token)!;
  }

  const decimals = await readContract(client, {
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  decimalsCache.set(token, decimals);
  return decimals;
}

async function readTokenUsdPrice(token: Address) {
  if (priceCache.has(token)) {
    return priceCache.get(token)!;
  }

  for (const pricer of [...pricers, ...fallbackPricers]) {
    const price = await Promise.resolve(pricer.price(client, token));
    if (price !== undefined && Number.isFinite(price) && price > 0) {
      priceCache.set(token, price);
      return price;
    }
  }

  throw new Error(`No USD price found for ${token}`);
}

async function probeAmount(token: Address, usdNotional: number) {
  const [decimals, usdPrice] = await Promise.all([
    readTokenDecimals(token),
    readTokenUsdPrice(token),
  ]);
  const tokenAmount = usdNotional / usdPrice;
  const fractionalDigits = Math.min(decimals, 6);
  const baseUnits = parseUnits(tokenAmount.toFixed(fractionalDigits), decimals);

  if (baseUnits <= 0n) {
    throw new Error(`Probe amount is zero for ${token} at price ${usdPrice}`);
  }

  return baseUnits;
}

async function fetchActiveUsms(): Promise<
  IndexerActiveUsmsResponse["activeUsms"]
> {
  const usmAddresses = await readContract(client, {
    address: USM_REGISTRY_ADDRESS,
    abi: UsmRegistryAbi,
    functionName: "getUsmList",
  });

  const activeUsms = await Promise.all(
    usmAddresses.map(async (usmAddress) => {
      const [
        stableToken,
        underlyingAsset,
        accessMode,
        underlyingExposureCap,
        availableUnderlyingExposure,
        canSwap,
      ] = await Promise.all([
        readContract(client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "STABLE_TOKEN",
        }),
        readContract(client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "UNDERLYING_ASSET",
        }),
        readContract(client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "getAccessMode",
        }),
        readContract(client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "getExposureCap",
        }),
        readContract(client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "getAvailableUnderlyingExposure",
        }),
        readContract(client, {
          address: usmAddress,
          abi: usmAbi,
          functionName: "canSwap",
        }),
      ]);

      const stableTokenAddress = getAddress(stableToken);
      const [minterConfig, allowedMinter, allowedBurner] = await Promise.all([
        readContract(client, {
          address: stableTokenAddress,
          abi: DusdAbi,
          functionName: "minterConfig",
          args: [usmAddress],
        }),
        readContract(client, {
          address: stableTokenAddress,
          abi: DusdAbi,
          functionName: "allowedMinter",
          args: [usmAddress],
        }),
        readContract(client, {
          address: stableTokenAddress,
          abi: DusdAbi,
          functionName: "allowedBurner",
          args: [usmAddress],
        }),
      ]);

      return {
        chainId: mainnet.id,
        address: getAddress(usmAddress),
        stableToken: stableTokenAddress,
        underlyingAsset: getAddress(underlyingAsset),
        underlyingExposureCap,
        currentExposure: underlyingExposureCap - availableUnderlyingExposure,
        type: (accessMode === 0 ? "permissionless" : "permissioned") as
          | "permissionless"
          | "permissioned",
        dusdConfig: {
          chainId: mainnet.id,
          minterAddress: getAddress(usmAddress),
          minterStatus: allowedMinter,
          burnerStatus: allowedBurner,
          minterCeiling: minterConfig[1],
          currentlyMinted: minterConfig[0],
        },
        isActive: true,
        swapsFrozen: !canSwap,
      } as IndexerActiveUsmsResponse["activeUsms"][number];
    }),
  );

  return activeUsms.filter(
    (usm) => usm.isActive && usm.type === "permissionless",
  );
}

const activeUsms = TEST_USM_MODE !== "never" ? await fetchActiveUsms() : [];

describe("executor configured pair routes", () => {
  it("prints the route for one configured pair at $1k, $100k, and $1m", async () => {
    const [collateralSymbol, loanSymbol] = await Promise.all([
      readTokenSymbol(COLLATERAL_TOKEN),
      readTokenSymbol(LOAN_TOKEN),
    ]);

    expect(pricers.length).toBeGreaterThan(0);

    console.log(
      `[configured-pair-routes] pair ${collateralSymbol} (${COLLATERAL_TOKEN}) -> ${loanSymbol} (${LOAN_TOKEN}) | usmMode=${TEST_USM_MODE}`,
    );

    for (const usdNotional of TARGET_USD_NOTIONALS) {
      const [probe, usdPrice] = await Promise.all([
        probeAmount(COLLATERAL_TOKEN, usdNotional),
        readTokenUsdPrice(COLLATERAL_TOKEN),
      ]);

      const result = await planBestConversionRoute({
        executorAddress: account.address,
        client,
        liquidityVenues: venues,
        activeUsms,
        usmMode: TEST_USM_MODE,
        usmSellAdapterAddress: mainnetConfig.options.usmSellAdapterAddress,
        surplusRecipient: account.address,
        toConvert: {
          src: COLLATERAL_TOKEN,
          dst: LOAN_TOKEN,
          srcAmount: probe,
        },
      });

      console.log(
        [
          `[configured-pair-routes] ~$${usdNotional.toLocaleString()}`,
          `${collateralSymbol} -> ${loanSymbol}`,
          `price=$${usdPrice.toFixed(6)}`,
          `srcAmount=${probe.toString()}`,
          `path=${result.path.join(" -> ") || "none"}`,
          `output=${result.toConvert.srcAmount.toString()}`,
          result.errors.length > 0
            ? `errors=${result.errors.join(" | ")}`
            : "errors=none",
        ].join(" | "),
      );

      expect(result.success).toBe(true);
    }
  }, 300_000);
});
