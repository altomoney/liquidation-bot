import { chainConfigs } from "@/config";
import { ExecutorEncoder } from "executooor-viem";
import {
  type Address,
  createWalletClient,
  erc20Abi,
  formatUnits,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readContract } from "viem/actions";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ENV } from "./utils/env";

async function run() {
  const argv = yargs(hideBin(process.argv))
    .option("chainId", {
      type: "number",
      description: "Chain ID to use",
      demandOption: true,
    })
    .option("token", {
      type: "string",
      description: "Token address",
      demandOption: true,
    })
    .option("recipient", {
      type: "string",
      description: "Recipient address",
      demandOption: false,
    })
    .parseSync();

  const token = argv.token as Address;
  const chainId = argv.chainId;

  if (!ENV.CHAIN_CONFIGS[chainId]) {
    throw new Error(`No chain config found for chainId ${chainId}`);
  }

  const { rpcUrl, privateKey, executorAddress } = ENV.CHAIN_CONFIGS[chainId];

  const chainConfig = chainConfigs[chainId];
  if (!chainConfig) {
    throw new Error(`Chain config for ${chainId} is not set`);
  }

  const client = createWalletClient({
    chain: chainConfig.chain,
    transport: http(rpcUrl),
    account: privateKeyToAccount(privateKey as Hex),
  });

  const recipient = argv.recipient ?? client.account.address;

  const encoder = new ExecutorEncoder(executorAddress as Address, client);

  const [balance, decimals, symbol] = await Promise.all([
    readContract(client, {
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [executorAddress as Address],
    }),
    readContract(client, {
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    readContract(client, {
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    }),
  ]);

  if (balance > 0n) {
    encoder.erc20Transfer(token, recipient as Address, balance);
    await encoder.exec();

    console.log(
      `Transferred ${formatUnits(
        balance,
        decimals
      )} ${symbol} to ${recipient} ✅`
    );
  }
}

void run();
