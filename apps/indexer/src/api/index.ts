import { Hono } from "hono";
import { and, client, eq, graphql } from "ponder";
import { db, publicClients } from "ponder:api";
import schema from "ponder:schema";
import { Address, Hex } from "viem";
import { replaceBigInts } from "../utils";
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

export default app;
