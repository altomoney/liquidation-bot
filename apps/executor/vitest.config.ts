import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    resolve: {
      alias: [
        {
          find: "@/indexer",
          replacement: new URL("../indexer", import.meta.url).pathname,
        },
        {
          find: "@/config",
          replacement: new URL("./config", import.meta.url).pathname,
        },
        {
          find: "@/test",
          replacement: new URL("./test", import.meta.url).pathname,
        },
        {
          find: "@",
          replacement: new URL("./src", import.meta.url).pathname,
        },
      ],
    },
    test: {
      fileParallelism: false,
      pool: "forks",
      hookTimeout: 300_000,
      include: ["test/**/*.test.ts"],
      testTimeout: 300_000,
      env: {
        RPC_URL_1:
          env.RPC_URL_1 ?? process.env.RPC_URL_1 ?? "http://localhost:8545",
        LIQUIDATION_PRIVATE_KEY_1:
          env.LIQUIDATION_PRIVATE_KEY_1 ??
          process.env.LIQUIDATION_PRIVATE_KEY_1 ??
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        EXECUTOR_ADDRESS_1:
          env.EXECUTOR_ADDRESS_1 ??
          process.env.EXECUTOR_ADDRESS_1 ??
          "0x0000000000000000000000000000000000000000",
        PONDER_SERVICE_URL:
          env.PONDER_SERVICE_URL ??
          process.env.PONDER_SERVICE_URL ??
          "http://localhost:42069",
        DEBUG_LIQUIDATION:
          env.DEBUG_LIQUIDATION ?? process.env.DEBUG_LIQUIDATION ?? "1",
      },
    },
  };
});
