import { Hono } from "hono";
import { client, graphql } from "ponder";
import { db, publicClients } from "ponder:api";
import schema from "ponder:schema";
import { Hex } from "viem";
import { replaceBigInts } from "../utils";
import { getLiquidatablePositions } from "./liquidatable-positions";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

/**
 * Fetch all liquidatable positions for a given set of markets.
 */
app.post("/chain/:chainId/liquidatable-positions", async (c) => {
  const { chainId: chainIdRaw } = c.req.param();
  const { marketAddresses: marketAddressesRaw, isPriorityLiquidator } =
    (await c.req.json()) as unknown as {
      marketAddresses: Hex[];
      isPriorityLiquidator: boolean;
    };

  if (!Array.isArray(marketAddressesRaw)) {
    return c.json(
      { error: "Request body must include a `marketAddresses` array." },
      400
    );
  }

  const chainId = Number.parseInt(chainIdRaw, 10);
  const marketAddresses = [...new Set(marketAddressesRaw)];

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
    marketAddresses,
    isPriorityLiquidator,
  });
  return c.json(replaceBigInts(response));
});

export default app;
