import { createConfig, factory } from "ponder";

import { Address, parseAbiItem } from "viem";
import { AdaptiveCurveIrmAbi } from "./abis/AdaptiveCurveIrmAbi";
import { AltoBorrowMarketAbi } from "./abis/AltoBorrowMarketAbi";
import { AltoMintMarketAbi } from "./abis/AltoMintMarketAbi";
import { FixedRateIrmAbi } from "./abis/FixedRateIrmAbi";

const MINT_MARKETS: Address[] = ["0x0ad372969FFb9409b270E7e38e93B128CE065141"];
const BORROW_MARKETS: Address[] = [
  "0x06E7Fa2e4C0e1B33D1B036E161df78d3e0e1c53E",
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
      startBlock: 9676111,
    },
    AltoMintMarket: {
      chain: "sepolia",
      abi: AltoMintMarketAbi,
      address: MINT_MARKETS,
      startBlock: 9676108,
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
      startBlock: 9676108,
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
      startBlock: 9676108,
    },
  },
});
