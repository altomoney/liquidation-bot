import type { ChainConfig } from "@/config";
import { createWalletClient, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { watchBlocks } from "viem/actions";

import { LiquidationBot, type LiquidationBotInputs } from "./bot";
import { createLiquidityVenue } from "./liquidity-venues";
import { createPricer } from "./pricers";
import { ENV } from "./utils/env";

export const launchBot = async (config: ChainConfig) => {
  const logTag = `[${config.chain.name} client]: `;
  console.log(`${logTag}Starting up`);

  const client = createWalletClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    account: privateKeyToAccount(config.liquidationPrivateKey),
  });

  // LIQUIDITY VENUES
  const liquidityVenues = config.liquidityVenues.map((liquidityVenueName) =>
    createLiquidityVenue(liquidityVenueName),
  );

  // PRICERS
  const pricers = config.pricers
    ? config.pricers.map((pricerName) => createPricer(pricerName))
    : undefined;

  if (ENV.CHECK_PROFIT && !(pricers && pricers.length > 0)) {
    throw new Error(`${logTag} You must configure pricers!`);
  }

  let flashbotAccount = undefined;
  if (ENV.USE_FLASHBOTS) {
    if (ENV.FLASHBOTS_PRIVATE_KEY === undefined) {
      throw new Error(`${logTag} FLASHBOTS_PRIVATE_KEY is not set`);
    }

    flashbotAccount = privateKeyToAccount(ENV.FLASHBOTS_PRIVATE_KEY as Hex);
  }

  const inputs: LiquidationBotInputs = {
    logTag,
    chainId: config.chainId,
    client,
    wNative: config.wNative,
    executorAddress: config.executorAddress,
    usmSellAdapterAddress: config.usmSellAdapterAddress,
    liquidationPeripheryAddress: config.liquidationPeripheryAddress,
    treasuryAddress: config.treasuryAddress ?? client.account.address,
    liquidityVenues,
    stableRouteMode: config.stableRouteMode ?? "swap_only",
    pricers: ENV.CHECK_PROFIT ? pricers : undefined,
    flashbotAccount,
    isPriorityLiquidator: config.isPriorityLiquidator,
  };

  const bot = new LiquidationBot(inputs);

  const blockInterval = config.blockInterval ?? 1;
  let count = 0;

  const startWatching = () => {
    watchBlocks(client, {
      onBlock: () => {
        if (count % blockInterval === 0) {
          bot.run().catch((e) => {
            console.error(`${logTag} uncaught error in bot.run():`, e);
          });
        }
        count++;
      },
      onError: (error) => {
        const retryDelay = config.watchBlocksRetryDelayMs ?? 5_000;
        console.error(
          `${logTag} watchBlocks error, restarting watcher in ${retryDelay}ms:`,
          error,
        );
        setTimeout(startWatching, retryDelay);
      },
    });
  };

  startWatching();
};
