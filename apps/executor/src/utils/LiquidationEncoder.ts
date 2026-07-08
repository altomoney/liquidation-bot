import { ExecutorEncoder } from "executooor-viem";
import type { Account, Address, Chain, Client, Hex, Transport } from "viem";
import { encodeAbiParameters, encodeFunctionData } from "viem";

import { LiquidationPeriphery } from "@/abis/liquidation-periphery";
import { IMarket } from "./types";

export class LiquidationEncoder<
  client extends Client<Transport, Chain, Account> = Client<
    Transport,
    Chain,
    Account
  >
> extends ExecutorEncoder<client> {
  public appendEncodedCalls(calls: Hex[]) {
    this.calls.push(...calls);
    return this;
  }

  public altoLiquidate(
    market: IMarket,
    borrower: Address,
    callbackCalls?: Hex[]
  ) {
    callbackCalls ??= [];

    return this.pushCall(
      market.address,
      0n,
      encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "liquidate",
            inputs: [
              {
                name: "borrower",
                type: "address",
                internalType: "address",
              },
              {
                name: "callbackData",
                type: "bytes",
                internalType: "bytes",
              },
              {
                name: "liquidationData",
                type: "bytes",
                internalType: "bytes",
              },
            ],
            outputs: [
              {
                name: "",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "",
                type: "uint256",
                internalType: "uint256",
              },
            ],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "liquidate",
        args: [
          borrower,
          encodeAbiParameters(
            [{ type: "bytes[]" }, { type: "bytes" }],
            [callbackCalls, "0x"]
          ),
          "0x",
        ],
      }),
      {
        sender: market.address,
        dataIndex: 2n, // onLiquidateCallback(uint256 assetsToRepay, uint256 collateralReceived, bytes calldata data)
      }
    );
  }

  public altoLiquidationPeripheryLiquidate(
    liquidationPeriphery: Address,
    market: IMarket,
    borrower: Address,
    usm: Address,
    callbackCalls?: Hex[],
  ) {
    callbackCalls ??= [];

    return this.pushCall(
      liquidationPeriphery,
      0n,
      encodeFunctionData({
        abi: LiquidationPeriphery,
        functionName: "liquidate",
        args: [
          market.address,
          borrower,
          usm,
          "0x",
          encodeAbiParameters(
            [{ type: "bytes[]" }, { type: "bytes" }],
            [callbackCalls, "0x"],
          ),
        ],
      }),
      {
        sender: liquidationPeriphery,
        dataIndex: 2n, // onLiquidationPeripheryCallback(uint256,uint256,bytes)
      },
    );
  }
}
