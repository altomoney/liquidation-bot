import { type ChildProcess } from "node:child_process";

import { chainConfig, chainConfigs } from "@/config";

import { launchBot } from ".";
import { ENV } from "./utils/env";

async function sleep(ms: number) {
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      resolve();
    }, ms)
  );
}

async function isPonderRunning(apiUrl: string) {
  try {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 5000);
    await fetch(`${apiUrl}/ready`, { signal: controller.signal });
    return true;
  } catch {
    return false;
  }
}

async function isPonderReady(apiUrl: string) {
  try {
    const response = await fetch(`${apiUrl}/ready`);
    return response.status === 200;
  } catch (e) {
    // @ts-expect-error: error cause is poorly typed.
    if (e instanceof TypeError && e.cause?.code === "ENOTFOUND") {
      console.warn(
        `⚠️ The ponder service at ${apiUrl} is unreachable. Please check your config.`
      );
    }
    return false;
  }
}

async function waitForIndexing(apiUrl: string) {
  while (!(await isPonderReady(apiUrl))) {
    console.log("⏳ Ponder is indexing");
    await sleep(1000);
  }
}

async function run() {
  let ponder: ChildProcess | undefined;

  const configs = Object.keys(chainConfigs)
    .map((config) => {
      try {
        return chainConfig(Number(config));
      } catch {
        return undefined;
      }
    })
    .filter((config) => config !== undefined);

  if (!(await isPonderRunning(ENV.PONDER_SERVICE_URL))) {
    console.error(`❌ Ponder is not running at ${ENV.PONDER_SERVICE_URL}`);
    process.exit(1);
  }

  try {
    await waitForIndexing(ENV.PONDER_SERVICE_URL);
    console.log("✅ Ponder is ready");

    console.log("🚀 Starting bot...");

    for (const config of configs) {
      await launchBot(config);
    }
  } catch (err) {
    console.error(err);
    if (ponder) ponder.kill("SIGTERM");
    process.exit(1);
  }
}

void run();
