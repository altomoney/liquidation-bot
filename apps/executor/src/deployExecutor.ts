import { chainConfigs } from "@/config";
import { bytecode, executorAbi } from "executooor-viem";
import {
  type Address,
  createWalletClient,
  type Hex,
  http,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceipt } from "viem/actions";
import { ENV } from "./utils/env";

async function run() {
  for (const chainId of Object.keys(ENV.CHAIN_CONFIGS)) {
    if (!ENV.CHAIN_CONFIGS[chainId]) {
      throw new Error(`No chain config found for chainId ${chainId}`);
    }
    const chain = chainConfigs[Number(chainId)]?.chain;
    const { rpcUrl, privateKey } = ENV.CHAIN_CONFIGS[chainId];

    const client = createWalletClient({
      chain,
      transport: http(rpcUrl),
      account: privateKeyToAccount(privateKey as Hex),
    });

    await deploy(client, privateKeyToAccount(privateKey as Hex).address);
  }
}

export const deploy = async (client: WalletClient, account: Address) => {
  const hash = await client.deployContract({
    abi: executorAbi,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    account: client.account!,
    bytecode,
    args: [account],
    chain: client.chain,
  });

  const tx = await waitForTransactionReceipt(client, { hash });

  console.log(
    `Executor deployed on ${client.chain?.id} at ${tx.contractAddress}`
  );

  return tx.contractAddress;
};

void run();
