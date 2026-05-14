import { createServer } from "node:net";
import { bytecode, executorAbi, ExecutorEncoder } from "executooor-viem";
import { Instance } from "prool";
import {
  createTestClient,
  http,
  publicActions,
  walletActions,
  type Address,
  type Chain,
} from "viem";
import { test as vitest } from "vitest";

import { chainConfigs } from "@/config";

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        return reject(new Error("Failed to get free port"));
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

function createAnvilClient(rpcUrl: string, account: Address, chain: Chain) {
  return createTestClient({
    mode: "anvil",
    chain,
    transport: http(rpcUrl),
    account,
  })
    .extend(publicActions)
    .extend(walletActions);
}

export type AnvilClient = ReturnType<typeof createAnvilClient>;

export function createExecutionTest(chainId: number, forkBlockNumber: bigint) {
  return vitest.extend<{
    client: AnvilClient;
    encoder: ExecutorEncoder;
  }>({
    // biome-ignore lint: vitest fixture requires destructuring in this pattern
    client: async ({}, use) => {
      console.log("[setup] Starting Anvil fork...");
      const forkRpcUrl = process.env[`RPC_URL_${chainId}`];
      const chain = chainConfigs[chainId]?.chain;

      if (!forkRpcUrl) {
        throw new Error(
          `Fork RPC URL for chain ${chainId} is not set. Check your environment variables for RPC_URL_${chainId}`,
        );
      }
      if (!chain) {
        throw new Error(`Missing chain config for chain ${chainId}`);
      }

      const freePort = await getFreePort();
      const instance = Instance.anvil({
        binary: `${process.env.HOME}/.foundry/bin/anvil`,
        forkUrl: forkRpcUrl,
        forkBlockNumber,
        forkChainId: chainId,
        autoImpersonate: true,
        gasPrice: 0n,
        blockBaseFeePerGas: 0n,
        port: freePort,
        retries: 10,
        noRateLimit: true,
      });

      const created = instance.create();
      await created.start();

      const rpcUrl = `http://${created.host}:${created.port}`;
      console.log(`[setup] Anvil ready at ${rpcUrl}`);

      // Fetch accounts from anvil to set a default account on the client
      const tempClient = createTestClient({
        mode: "anvil",
        chain,
        transport: http(rpcUrl),
      }).extend(walletActions);
      const [defaultAccount] = await tempClient.getAddresses();
      if (!defaultAccount) {
        throw new Error("Missing Anvil default account");
      }

      const client = createAnvilClient(rpcUrl, defaultAccount, chain);

      await use(client);

      await created.stop();
      console.log("[setup] Anvil stopped");
    },

    encoder: async ({ client }, use) => {
      console.log("[setup] Deploying executor...");
      const [account] = await client.getAddresses();
      if (!account) {
        throw new Error("Missing Anvil deployer account");
      }

      const hash = await client.deployContract({
        abi: executorAbi,
        bytecode,
        args: [account],
        account,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });

      if (!receipt.contractAddress) {
        throw new Error("Executor deployment failed");
      }

      console.log(`[setup] Executor deployed at ${receipt.contractAddress}`);

      await use(
        new ExecutorEncoder(receipt.contractAddress as Address, client as any),
      );
    },
  });
}

export const executionTest = createExecutionTest;
