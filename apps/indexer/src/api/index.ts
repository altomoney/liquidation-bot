import { Hono } from "hono";
import { and, client, eq, graphql } from "ponder";
import { db, publicClients } from "ponder:api";
import schema from "ponder:schema";
import { Address, Hex } from "viem";
import { replaceBigInts } from "../utils";
import {
  getAllUsersWithPositions,
  getFirstBorrowPositionForUser,
  getFirstSupplyPositionForUser,
  getMarketInfo,
  getMarketStateAtBlock,
  getMarketStateAtOrAfterBlock,
  getPositionHistoryForUser,
  getPositionStateAtBlock,
} from "./interest-calculation";
import { getLiquidatablePositions } from "./liquidatable-positions";
import { IndexerActiveUsmsResponse } from "./types";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

/**
 * Fetch all liquidatable positions for a given set of markets.
 */
app.post("/chain/:chainId/liquidatable-positions", async (c) => {
  const { chainId: chainIdRaw } = c.req.param();
  const { isPriorityLiquidator, liquidatorAddress } =
    (await c.req.json()) as unknown as {
      marketAddresses: Hex[];
      isPriorityLiquidator: boolean;
      liquidatorAddress: Address;
    };

  const chainId = Number.parseInt(chainIdRaw, 10);

  const publicClient = Object.values(publicClients).find(
    (publicClient) => publicClient.chain?.id === chainId
  );

  if (!publicClient) {
    return c.json(
      {
        error: `${chainIdRaw} is not one of the supported chains: [${Object.keys(
          publicClients
        ).join(", ")}]`,
      },
      400
    );
  }

  const response = await getLiquidatablePositions({
    db,
    chainId,
    publicClient,
    isPriorityLiquidator,
    liquidatorAddress,
  });
  return c.json(replaceBigInts(response));
});

// Fetch all active USMs for a given chain.
app.post("/chain/:chainId/active-usms", async (c) => {
  const { chainId: chainIdRaw } = c.req.param();

  const chainId = Number.parseInt(chainIdRaw, 10);

  const publicClient = Object.values(publicClients).find(
    (publicClient) => publicClient.chain?.id === chainId
  );

  if (!publicClient) {
    return c.json(
      {
        error: `${chainIdRaw} is not one of the supported chains: [${Object.keys(
          publicClients
        ).join(", ")}]`,
      },
      400
    );
  }

  const usms = await db.query.usm.findMany({
    where: (row) =>
      and(
        eq(row.chainId, chainId),
        eq(row.isActive, true),
        eq(row.type, "permissionless"),
        eq(row.swapsFrozen, false)
      ),
    with: {
      dusdConfig: true,
    },
  });

  const result: IndexerActiveUsmsResponse = {
    activeUsms: usms,
  };

  return c.json(replaceBigInts(result));
});

// ============================================================
// Interest Calculation API Endpoints
// ============================================================

/**
 * Get market info (type, tokens, etc.)
 */
app.get("/chain/:chainId/market/:marketAddress/info", async (c) => {
  const { chainId: chainIdRaw, marketAddress } = c.req.param();
  const chainId = Number.parseInt(chainIdRaw, 10);

  const result = await getMarketInfo(db, chainId, marketAddress as Hex);

  return c.json(result);
});

/**
 * Get market state at a specific block.
 */
app.get(
  "/chain/:chainId/market/:marketAddress/state-at-block/:blockNumber",
  async (c) => {
    const { chainId: chainIdRaw, marketAddress, blockNumber } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const result = await getMarketStateAtBlock(
      db,
      chainId,
      marketAddress as Hex,
      BigInt(blockNumber)
    );

    return c.json(result);
  }
);

/**
 * Get all users with positions in a market.
 */
app.get(
  "/chain/:chainId/market/:marketAddress/users/:endBlock",
  async (c) => {
    const { chainId: chainIdRaw, marketAddress, endBlock } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const users = await getAllUsersWithPositions(
      db,
      chainId,
      marketAddress as Hex,
      BigInt(endBlock)
    );

    return c.json({ users });
  }
);

/**
 * Get a user's position at a specific block.
 */
app.get(
  "/chain/:chainId/market/:marketAddress/user/:user/position-at-block/:blockNumber",
  async (c) => {
    const {
      chainId: chainIdRaw,
      marketAddress,
      user,
      blockNumber,
    } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const result = await getPositionStateAtBlock(
      db,
      chainId,
      marketAddress as Hex,
      user as Hex,
      BigInt(blockNumber)
    );

    return c.json(result);
  }
);

/**
 * Get a user's first supply position in a market.
 */
app.get(
  "/chain/:chainId/market/:marketAddress/user/:user/first-supply-position",
  async (c) => {
    const { chainId: chainIdRaw, marketAddress, user } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const result = await getFirstSupplyPositionForUser(
      db,
      chainId,
      marketAddress as Hex,
      user as Hex
    );

    return c.json(result);
  }
);

/**
 * Get a user's first borrow position in a market.
 */
app.get(
  "/chain/:chainId/market/:marketAddress/user/:user/first-borrow-position",
  async (c) => {
    const { chainId: chainIdRaw, marketAddress, user } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const result = await getFirstBorrowPositionForUser(
      db,
      chainId,
      marketAddress as Hex,
      user as Hex
    );

    return c.json(result);
  }
);

/**
 * Get a user's position history within a block range.
 */
app.get(
  "/chain/:chainId/market/:marketAddress/user/:user/history/:startBlock/:endBlock",
  async (c) => {
    const {
      chainId: chainIdRaw,
      marketAddress,
      user,
      startBlock,
      endBlock,
    } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const result = await getPositionHistoryForUser(
      db,
      chainId,
      marketAddress as Hex,
      user as Hex,
      BigInt(startBlock),
      BigInt(endBlock)
    );

    return c.json(result);
  }
);

/**
 * Get market state at or after a specific block (first recorded state).
 */
app.get(
  "/chain/:chainId/market/:marketAddress/state-at-or-after-block/:blockNumber",
  async (c) => {
    const { chainId: chainIdRaw, marketAddress, blockNumber } = c.req.param();
    const chainId = Number.parseInt(chainIdRaw, 10);

    const result = await getMarketStateAtOrAfterBlock(
      db,
      chainId,
      marketAddress as Hex,
      BigInt(blockNumber)
    );

    return c.json(result);
  }
);

export default app;
