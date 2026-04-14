# Liquidation Bot

End-to-end liquidation bot for Alto lending markets. Consists of two apps:

- **Indexer** (`apps/indexer`) - Ponder-based on-chain indexer that tracks markets, positions, and oracle prices.
- **Executor** (`apps/executor`) - Bot that polls the indexer for liquidatable positions and executes liquidations.

## Prerequisites

A devcontainer configuration is included (`.devcontainer/`) - this is the easiest way to get a consistent environment with all dependencies pre-installed.

Otherwise, you need:

- Node.js >= 18.14
- pnpm
- Bun (optional - used by the executor and snapshot scripts)

Environment variables described in `apps/indexer/.env.example` must be set - either via `apps/indexer/.env.local` for development or as OS environment variables in production.

## API Snapshot Testing

The indexer includes a snapshot mechanism (`scripts/snapshot-api.ts`) for regression testing API responses. It captures the full output of the indexer's API endpoints at a pinned block and timestamp, then verifies future runs produce identical results. This is used to ensure refactors (e.g. SDK migrations) don't change API behavior.

### How it works

1. Set `DEV_END_BLOCK` and `DEV_EVALUATION_TIMESTAMP` in `apps/indexer/.env.local` to pin the indexer to a specific chain state.
2. Start Ponder on port 42069: `pnpm dev --port 42069`
3. Capture a baseline: `pnpm snapshot:baseline` - fetches `/liquidatable-positions` and `/active-usms`, writes the response to `test/snapshots/api-baseline.json`.
4. After making changes, verify parity: `pnpm snapshot:verify` - fetches the same endpoints and diffs against the baseline.

### Available scripts

#### Indexer (`apps/indexer`)

| Script                   | Description                                   |
| ------------------------ | --------------------------------------------- |
| `pnpm dev`               | Start the indexer in dev mode                 |
| `pnpm snapshot:baseline` | Capture API baseline snapshot at pinned block |
| `pnpm snapshot:verify`   | Verify current API output matches baseline    |

#### Executor (`apps/executor`)

| Script                 | Description                  |
| ---------------------- | ---------------------------- |
| `pnpm run:bot`         | Start the liquidation bot    |
| `pnpm deploy:executor` | Deploy the executor contract |
