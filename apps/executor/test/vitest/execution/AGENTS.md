# Adding a Liquidation Test for a New Market

This guide describes how to create a pinned fork liquidation test for a new Alto lending market. Each test pins an Odos (or 1inch) quote at a specific block, forks mainnet at that block, sets up a borrower position, slashes the oracle to make it liquidatable, and runs the bot to verify execution.

## Prerequisites

- The market must be registered on-chain (borrow or mint market in the registry at `0xBd45d50611c38E35dD1D1119077De1E988eD2257`).
- `RPC_URL_1` must be set in `apps/executor/.env.local`.
- Anvil must be installed at `$HOME/.foundry/bin/anvil`.

## Step 1: Get the market address

Ask the user for the market address. If they provide a collateral token name instead, look it up by querying the market registry:

```bash
# From apps/executor, with RPC_URL_1 set:
# getBorrowMarkets() selector = 0x89545353
# getMintMarkets() selector = 0xf0f783d2
curl -s -X POST "$RPC_URL_1" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0xBd45d50611c38E35dD1D1119077De1E988eD2257","data":"0x89545353"},"latest"],"id":1}'
```

Then read `collateralToken()` (selector `0xb2016bd4`) and `symbol()` on each to find the match.

## Step 2: Determine the route

Run `configuredPairRoutes.test.ts` with the market's collateral and loan token to discover the production route:

```bash
cd apps/executor
ROUTE_TEST_COLLATERAL_TOKEN=<collateral_address> \
ROUTE_TEST_LOAN_TOKEN=0x63d74d22E689C715a04F2C13962b1f77F443d35b \
pnpm vitest run test/vitest/configuredPairRoutes.test.ts --reporter=verbose
```

The output shows which venues the planner picks (e.g., `Odos -> UsmVenue`). Note the venues used.

## Step 3: Determine collateral amount and decimals

Read the collateral token's `decimals()` (selector `0x313ce567`). Choose a collateral amount worth roughly $10k-$15k at current prices. Examples:

| Token     | Decimals | Amount constant                    |
|-----------|----------|------------------------------------|
| WBTC      | 8        | `10n * 10n ** 8n`  (10 WBTC)      |
| sUSDe     | 18       | `10_000n * 10n ** 18n` (10k)      |
| syrupUSDC | 6        | `10_000n * 10n ** 6n`  (10k)      |

## Step 4: Fetch and pin the Odos fixture

The swap amount must include the **liquidation buffer** (50 bps). The market's liquidation engine deducts a `protocolSeizedCollateralFee` from the seized collateral before transferring it to the executor. The buffer ensures the Odos swap amount is less than what the executor actually receives. Multiply the collateral amount by 0.995:

```
bufferedAmount = collateralAmount * 995 / 1000
```

Query the Odos quote API with the buffered amount, swapping collateral -> USDC:

```bash
curl -s -X POST "https://api.odos.xyz/sor/quote/v3" \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "inputTokens": [{"tokenAddress": "<COLLATERAL_ADDRESS>", "amount": "<BUFFERED_AMOUNT>"}],
    "outputTokens": [{"tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "proportion": 1}],
    "userAddr": "0x5bCC3154698bBC205ABF09351A52DD2d1A39F608",
    "slippageLimitPercent": 0.01,
    "compact": true
  }'
```

Record `outAmounts`, `pathId`, and `blockNumber` from the response.

Then assemble:

```bash
curl -s -X POST "https://api.odos.xyz/sor/assemble" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddr": "0x5bCC3154698bBC205ABF09351A52DD2d1A39F608",
    "pathId": "<PATH_ID>",
    "receiver": "0x5bCC3154698bBC205ABF09351A52DD2d1A39F608",
    "simulate": false
  }'
```

The executor address `0x5bCC3154698bBC205ABF09351A52DD2d1A39F608` is the deterministic CREATE address for Anvil's first account deploying its first contract.

## Step 5: Create the fixture file

Create `apps/executor/test/fixtures/odos<Token>Usdc.ts`:

```typescript
export const <TOKEN>_ODOS_FORK_BLOCK_NUMBER = <BLOCK_NUMBER>n;

export const odos<Token>UsdcFixture = {
  quote: {
    outAmounts: ["<OUT_AMOUNT>"],
    pathId: "<PATH_ID>",
    blockNumber: <BLOCK_NUMBER>,
  },
  assembled: {
    blockNumber: <BLOCK_NUMBER>,
    transaction: {
      gas: <GAS>,
      gasPrice: <GAS_PRICE>,
      value: "0",
      to: "<ROUTER_ADDRESS>",
      from: "0x5bCC3154698bBC205ABF09351A52DD2d1A39F608",
      data: "<CALLDATA>",
      nonce: 0,
      chainId: 1,
    },
  },
} as const;
```

Naming convention: uppercase `TOKEN` for the block constant (e.g. `WBTC_ODOS_FORK_BLOCK_NUMBER`), camelCase `token` for the fixture object (e.g. `odosWbtcUsdcFixture`).

See existing fixtures in `apps/executor/test/fixtures/` for reference.

## Step 6: Create the test file

Create `apps/executor/test/vitest/execution/<token>Liquidation.test.ts`.

Use the existing tests as a template. The structure is always the same — only these values change per market:

| Field | Per-market value |
|-------|-----------------|
| `MARKET_ADDRESS` | The market contract address |
| Fixture imports | The fixture created in Step 5 |
| `collateralAmount` | From Step 3 |
| `logTag` | `"[test-<token>] "` |
| `describe` label | `"<Token> liquidation fork test"` |
| Final assertions | See below |

**Read these existing tests for the exact template:**

- `wbtcLiquidation.test.ts` — borrow market, strict assertions
- `susdeLiquidation.test.ts` — mint market, relaxed assertions (sUSDe has dust from ERC4626 vault mechanics)
- `syrupusdcLiquidation.test.ts` — borrow market, strict assertions
- `rethLiquidation.test.ts` — mint market, relaxed assertions
- `wstethLiquidation.test.ts` — mint market, relaxed assertions
- `tbtcLiquidation.test.ts` — mint market, relaxed assertions
- `cbbtcLiquidation.test.ts` — borrow market, strict assertions
- `paxgLiquidation.test.ts` — borrow market, strict assertions

### Assertion rules

Whether to use strict or relaxed assertions depends on the specific market, not its type. Run the test first with strict assertions; if dust remains, switch to relaxed.

**Strict** (complete liquidation, no residual collateral or debt):
```typescript
expect(finalPosition.collateralAssets).toBe(0n);
expect(finalPosition.borrowShares).toBe(0n);
```

**Relaxed** (small dust or socialized bad debt may remain):
```typescript
expect(finalPosition.collateralAssets).toBeLessThanOrEqual(10n);
expect(finalPosition.borrowShares).toBeLessThan(
  borrowerPositionAfterSetup.borrowShares,
);
```

### Nock setup

The `beforeEach` block mocks Odos (or 1inch) API calls with the pinned fixture:

```typescript
beforeEach(() => {
  nock.cleanAll();
  nock("https://api.odos.xyz")
    .post("/sor/quote/v3")
    .reply(200, fixture.quote);
  nock("https://api.odos.xyz")
    .post("/sor/assemble")
    .reply(200, fixture.assembled);
});
```

If the route uses **1inch** instead of Odos, adjust the nock URLs accordingly.

## Step 7: Run and verify

```bash
cd apps/executor
pnpm vitest run test/vitest/execution/<token>Liquidation.test.ts --reporter=verbose
```

The test should pass. If it fails:

1. **"ERC20: transfer amount exceeds balance"** — the buffered amount is too large. The market's `protocolSeizedCollateralFee` reduces what the executor receives. Increase the buffer or double-check the collateral amount calculation.
2. **Simulation failed / not profitable** — set `DEBUG_LIQUIDATION=1` and rerun. The `debug_traceCall` output will show exactly where the revert happens.
3. **Anvil port conflict** — `vitest.config.ts` has `fileParallelism: false` to prevent this. If running a single test file, this shouldn't happen.

## Step 8: Run the full execution test suite

Verify no regressions:

```bash
pnpm vitest run test/vitest/execution/ --reporter=verbose
```

All existing tests plus the new one should pass.
