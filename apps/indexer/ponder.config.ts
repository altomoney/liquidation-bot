import { createConfig, factory } from "ponder";

import { Address, parseAbiItem } from "viem";
import { AdaptiveCurveIrmAbi } from "./abis/AdaptiveCurveIrmAbi";
import { AltoBorrowMarketAbi } from "./abis/AltoBorrowMarketAbi";
import { AltoMintMarketAbi } from "./abis/AltoMintMarketAbi";
import { FixedRateIrmAbi } from "./abis/FixedRateIrmAbi";

const MINT_MARKETS: Address[] = ["0xcc20007C1b16BC96cC139F5976D3bA7efbeB7cBa"];
const BORROW_MARKETS: Address[] = [
  "0xacFD299b624f8462DCA3B840B78C54941E9f6686",
];
const ALL_MARKETS: Address[] = [...MINT_MARKETS, ...BORROW_MARKETS];

export default createConfig({
  chains: {
    sepolia: {
      id: 11155111,
      rpc: process.env.PONDER_RPC_URL_11155111!,
    },
  },
  contracts: {
    AltoBorrowMarket: {
      chain: "sepolia",
      abi: AltoBorrowMarketAbi,
      address: BORROW_MARKETS,
      startBlock: 9655294,
    },
    AltoMintMarket: {
      chain: "sepolia",
      abi: AltoMintMarketAbi,
      address: MINT_MARKETS,
      startBlock: 9655293,
    },
    FixedRateIrm: {
      abi: FixedRateIrmAbi,
      chain: "sepolia",
      address: factory({
        // Address of the factory contract.
        address: ALL_MARKETS,
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem(
          "event SetIrm(address indexed oldAddr, address indexed newAddr)"
        ),
        parameter: "newAddr",
      }),
      startBlock: 9655293,
    },
    AdaptiveCurveIrm: {
      abi: AdaptiveCurveIrmAbi,
      chain: "sepolia",
      address: factory({
        // Address of the factory contract.
        address: ALL_MARKETS,
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem(
          "event SetIrm(address indexed oldAddr, address indexed newAddr)"
        ),
        parameter: "newAddr",
      }),
      startBlock: 9655293,
    },
  },
});
