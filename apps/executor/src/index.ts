import type { ChainConfig } from "@/config";
import { createWalletClient, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { watchBlocks } from "viem/actions";

import { LiquidationBot, type LiquidationBotInputs } from "./bot";
import { UniswapSmartOrderRouterVenue, UsmVenue } from "./liquidityVenues";
import type { LiquidityVenue } from "./liquidityVenues/liquidityVenue";
import { ChainlinkPricer, DefiLlamaPricer } from "./pricers";
import type { Pricer } from "./pricers/pricer";

export const launchBot = (config: ChainConfig) => {
  const logTag = `[${config.chain.name} client]: `;
  console.log(`${logTag}Starting up`);

  const client = createWalletClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    account: privateKeyToAccount(config.liquidationPrivateKey),
  });

  // LIQUIDITY VENUES
  const liquidityVenues: LiquidityVenue[] = [];
  // liquidityVenues.push(new Erc20Wrapper());
  // liquidityVenues.push(new Erc4626());
  liquidityVenues.push(new UniswapSmartOrderRouterVenue());
  if (config.usms && config.usms.length > 0) {
    liquidityVenues.push(new UsmVenue({ usmAddresses: config.usms }));
  }
  // liquidityVenues.push(new UniswapV3Venue());
  // liquidityVenues.push(new UniswapV4Venue());

  // PRICERS
  const pricers: Pricer[] = [];
  pricers.push(new DefiLlamaPricer());
  pricers.push(new ChainlinkPricer());

  if (config.checkProfit && pricers.length === 0) {
    throw new Error(`${logTag} You must configure pricers!`);
  }

  let flashbotAccount = undefined;
  if (config.useFlashbots) {
    const flashbotsPrivateKey = process.env.FLASHBOTS_PRIVATE_KEY;

    if (flashbotsPrivateKey === undefined) {
      throw new Error(`${logTag} FLASHBOTS_PRIVATE_KEY is not set`);
    }

    flashbotAccount = privateKeyToAccount(
      process.env.FLASHBOTS_PRIVATE_KEY as Hex
    );
  }

  const inputs: LiquidationBotInputs = {
    logTag,
    chainId: config.chainId,
    client,
    markets: config.markets,
    wNative: config.wNative,
    executorAddress: config.executorAddress,
    treasuryAddress: config.treasuryAddress ?? client.account.address,
    liquidityVenues,
    pricers: config.checkProfit ? pricers : undefined,
    flashbotAccount,
    isPriorityLiquidator: config.isPriorityLiquidator,
  };

  const bot = new LiquidationBot(inputs);

  const blockInterval = config.blockInterval ?? 1;
  let count = 0;

  watchBlocks(client, {
    onBlock: () => {
      if (count % blockInterval === 0) {
        try {
          void bot.run();
        } catch (e) {
          console.error(`${logTag} uncaught error in bot.run():`, e);
        }
      }
      count++;
    },
  });
};
