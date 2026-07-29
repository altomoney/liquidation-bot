# Adding a Liquidation Test for a New Market

This guide describes how to create a pinned fork liquidation test for a new Alto lending market. Each test pins a 1inch quote at a specific block, forks mainnet at that block, sets up a borrower position, slashes the oracle to make it liquidatable, and runs the bot to verify execution.

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

The output shows which venues the planner picks (e.g., `1inch -> UsmVenue`). Note the venues used.

## Step 3: Determine collateral amount and decimals

Read the collateral token's `decimals()` (selector `0x313ce567`). Choose a collateral amount worth roughly $10k-$15k at current prices. Examples:

| Token     | Decimals | Amount constant                    |
|-----------|----------|------------------------------------|
| WBTC      | 8        | `10n * 10n ** 8n`  (10 WBTC)      |
| sUSDe     | 18       | `10_000n * 10n ** 18n` (10k)      |
| syrupUSDC | 6        | `10_000n * 10n ** 6n`  (10k)      |

## Step 4: Fetch and pin the 1inch fixture

The swap amount must include the **liquidation buffer** (50 bps). The market's liquidation engine deducts a `protocolSeizedCollateralFee` from the seized collateral before transferring it to the executor. The buffer ensures the 1inch swap amount is less than what the executor actually receives. Multiply the collateral amount by 0.995:

```
bufferedAmount = collateralAmount * 995 / 1000
```

Query the 1inch swap API with the buffered amount, swapping collateral -> USDC. Use the deployed test executor as `from` and its owner as `origin`:

```bash
curl -sS --get "https://api.1inch.dev/swap/v6.1/1/swap" \
  -H "Authorization: Bearer $ONE_INCH_SWAP_API_KEY" \
  --data-urlencode "src=<COLLATERAL_ADDRESS>" \
  --data-urlencode "dst=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" \
  --data-urlencode "amount=<BUFFERED_AMOUNT>" \
  --data-urlencode "from=<EXECUTOR_ADDRESS>" \
  --data-urlencode "origin=<EXECUTOR_OWNER_ADDRESS>" \
  --data-urlencode "slippage=1" \
  --data-urlencode "includeTokensInfo=false" \
  --data-urlencode "includeProtocols=false" \
  --data-urlencode "includeGas=false" \
  --data-urlencode "allowPartialFill=false" \
  --data-urlencode "disableEstimate=true" \
  --data-urlencode "usePermit2=false" \
  --data-urlencode "excludedProtocols=EKUBO,EKUBO_V3,ONE_INCH_LIMIT_ORDER,ONE_INCH_LIMIT_ORDER_V2,ONE_INCH_LIMIT_ORDER_V3,ONE_INCH_LIMIT_ORDER_V4,PMM11,PMM15,ZEROX_LIMIT_ORDER"
```

Record `dstAmount` and `tx` from the response, then immediately record the mainnet block number:

```bash
cast block-number --rpc-url "$RPC_URL_1"
```

The fixture calldata must send swap output back to the executor. If the test setup's executor address changes, fetch a new quote rather than reusing calldata built for the old address.

## Step 5: Create the fixture file

Create `apps/executor/test/fixtures/oneInch<Token>Usdc.ts`:

```typescript
export const <TOKEN>_ONE_INCH_FORK_BLOCK_NUMBER = <BLOCK_NUMBER>n;

export const oneInch<Token>UsdcFixture = {
  srcAmount: "<BUFFERED_AMOUNT>",
  dstAmount: "<DST_AMOUNT>",
  swap: {
    dstAmount: "<DST_AMOUNT>",
    tx: {
      from: "<EXECUTOR_ADDRESS>",
      to: "<ROUTER_ADDRESS>",
      data: "<CALLDATA>",
      value: "0",
    },
  },
} as const;
```

Naming convention: uppercase `TOKEN` for the block constant (e.g. `WBTC_ONE_INCH_FORK_BLOCK_NUMBER`), camelCase `token` for the fixture object (e.g. `oneInchWbtcUsdcFixture`).

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

- `wbtcOneInchLiquidation.test.ts` — borrow market, strict assertions
- `susdeOneInchLiquidation.test.ts` — mint market, relaxed assertions (sUSDe has dust from ERC4626 vault mechanics)
- `syrupusdcOneInchLiquidation.test.ts` — borrow market, strict assertions
- `rethOneInchLiquidation.test.ts` — mint market, relaxed assertions
- `wstethOneInchLiquidation.test.ts` — mint market, relaxed assertions
- `tbtcOneInchLiquidation.test.ts` — mint market, relaxed assertions
- `cbbtcOneInchLiquidation.test.ts` — borrow market, strict assertions
- `paxgOneInchLiquidation.test.ts` — borrow market, strict assertions

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

The `beforeEach` block mocks the 1inch API call with the pinned fixture:

```typescript
beforeEach(() => {
  nock.cleanAll();
  nock("https://api.1inch.dev")
    .get("/swap/v6.1/1/swap")
    .query(true)
    .reply(200, fixture.swap);
});
```

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
