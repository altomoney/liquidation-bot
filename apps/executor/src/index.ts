import type { ChainConfig } from "@/config";
import { createWalletClient, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { watchBlocks } from "viem/actions";

import { LiquidationBot, type LiquidationBotInputs } from "./bot";
import { UniswapSmartOrderRouterVenue, UsmVenue } from "./liquidityVenues";
import type { LiquidityVenue } from "./liquidityVenues/liquidityVenue";
import { ChainlinkPricer, DefiLlamaPricer, StablecoinPricer } from "./pricers";
import type { Pricer } from "./pricers/pricer";
import { ENV } from "./utils/env";
import { fetchActiveUsms } from "./utils/fetchers";

export const launchBot = async (config: ChainConfig) => {
  const logTag = `[${config.chain.name} client]: `;
  console.log(`${logTag}Starting up`);

  const client = createWalletClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    account: privateKeyToAccount(config.liquidationPrivateKey),
  });

  const activeUsms = await fetchActiveUsms(config.chainId);

  // LIQUIDITY VENUES
  const liquidityVenues: LiquidityVenue[] = [];
  // liquidityVenues.push(new Erc20Wrapper());
  // liquidityVenues.push(new Erc4626());
  liquidityVenues.push(new UniswapSmartOrderRouterVenue());
  if (activeUsms.length > 0) {
    liquidityVenues.push(new UsmVenue(activeUsms));
  }
  // liquidityVenues.push(new UniswapV3Venue());
  // liquidityVenues.push(new UniswapV4Venue());

  // PRICERS
  const pricers: Pricer[] = [];
  pricers.push(
    new StablecoinPricer([
      "0x63d74d22E689C715a04F2C13962b1f77F443d35b", // DUSD
    ]),
  );
  pricers.push(new DefiLlamaPricer());
  pricers.push(new ChainlinkPricer());

  if (ENV.CHECK_PROFIT && pricers.length === 0) {
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
    treasuryAddress: config.treasuryAddress ?? client.account.address,
    liquidityVenues,
    pricers: ENV.CHECK_PROFIT ? pricers : undefined,
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
