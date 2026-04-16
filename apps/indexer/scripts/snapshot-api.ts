import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PORT = 42069;
const CHAIN_ID = process.env.CHAIN_ID;
const DEV_END_BLOCK = process.env.DEV_END_BLOCK;
const DEV_EVALUATION_TIMESTAMP = process.env.DEV_EVALUATION_TIMESTAMP;

if (!CHAIN_ID) throw new Error("CHAIN_ID env var is required");
if (!DEV_END_BLOCK)
  throw new Error("DEV_END_BLOCK env var is required for snapshots");
if (!DEV_EVALUATION_TIMESTAMP)
  throw new Error("DEV_EVALUATION_TIMESTAMP env var is required for snapshots");

const rootDir = resolve(import.meta.dirname!, "..");
const outputPath = resolve(rootDir, "scripts/temp/api-baseline.json");
const READY_TIMEOUT_MS = 30 * 60_000;

const mode = process.argv[2] ?? "capture";
if (mode !== "capture" && mode !== "verify") {
  throw new Error(`Invalid mode "${mode}". Use "capture" or "verify".`);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stable(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

async function waitForReady(baseUrl: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    try {
      const response = await fetch(new URL("/ready", baseUrl));
      if (response.ok) return;
    } catch {}

    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(
    `Timed out waiting for ponder /ready after ${READY_TIMEOUT_MS}ms`,
  );
}

async function fetchSnapshot(baseUrl: string) {
  const liquidatablePositionsResponse = await fetch(
    new URL(`/chain/${CHAIN_ID}/liquidatable-positions`, baseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        isPriorityLiquidator: false,
        liquidatorAddress: "0x0000000000000000000000000000000000000000",
      }),
    },
  );

  if (!liquidatablePositionsResponse.ok) {
    throw new Error(
      `Failed to fetch liquidatable positions: ${liquidatablePositionsResponse.status} ${liquidatablePositionsResponse.statusText}`,
    );
  }

  const activeUsmsResponse = await fetch(
    new URL(`/chain/${CHAIN_ID}/active-usms`, baseUrl),
    { method: "POST" },
  );

  if (!activeUsmsResponse.ok) {
    throw new Error(
      `Failed to fetch active USMs: ${activeUsmsResponse.status} ${activeUsmsResponse.statusText}`,
    );
  }

  return {
    meta: {
      chainId: Number(CHAIN_ID),
      endBlock: Number(DEV_END_BLOCK),
      evaluationTimestamp: Number(DEV_EVALUATION_TIMESTAMP),
      liquidatorAddress: "0x0000000000000000000000000000000000000000",
      isPriorityLiquidator: false,
    },
    responses: {
      liquidatablePositions: await liquidatablePositionsResponse.json(),
      activeUsms: await activeUsmsResponse.json(),
    },
  };
}

async function main() {
  const baseUrl = `http://127.0.0.1:${PORT}`;

  console.log(`Waiting for ponder at ${baseUrl} ...`);
  await waitForReady(baseUrl);
  console.log("Ponder is ready, fetching snapshot...");

  const snapshot = await fetchSnapshot(baseUrl);
  const serialized = stableStringify(snapshot);

  mkdirSync(dirname(outputPath), { recursive: true });

  if (mode === "capture") {
    writeFileSync(outputPath, serialized);
    console.log(`Wrote baseline snapshot to ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Baseline snapshot does not exist at ${outputPath}`);
  }

  const expected = readFileSync(outputPath, "utf8");
  if (expected !== serialized) {
    const actualPath = resolve(rootDir, "scripts/temp/api-current.json");
    writeFileSync(actualPath, serialized);
    throw new Error(
      `Snapshot mismatch. Baseline: ${outputPath}. Current output: ${actualPath}`,
    );
  }

  console.log(`Snapshot matches baseline at ${outputPath}`);
}

await main();
