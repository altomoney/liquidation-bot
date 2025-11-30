import { createConfig, factory } from "ponder";

import { Address, parseAbiItem } from "viem";
import { AdaptiveCurveIrmAbi } from "./abis/AdaptiveCurveIrmAbi";
import { AltoBorrowMarketAbi } from "./abis/AltoBorrowMarketAbi";
import { AltoMintMarketAbi } from "./abis/AltoMintMarketAbi";
import { DlbDcfPriorityLiquidationEngineAbi } from "./abis/DlbDcfPriorityLiquidationEngineAbi";
import { FixedRateIrmAbi } from "./abis/FixedRateIrmAbi";

const MINT_MARKETS: Address[] = ["0xD67062b0bc443c656C2A07A0B1cceEACF114DA06"];
const BORROW_MARKETS: Address[] = [
  "0x4d40ddc251Db7F9b24efF017dd26f2294F8d573b",
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
      startBlock: 9740175,
    },
    AltoMintMarket: {
      chain: "sepolia",
      abi: AltoMintMarketAbi,
      address: MINT_MARKETS,
      startBlock: 9740174,
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
      startBlock: 9740174,
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
      startBlock: 9740174,
    },
    DlbDcfPriorityLiquidationEngine: {
      abi: DlbDcfPriorityLiquidationEngineAbi,
      chain: "sepolia",
      address: factory({
        // Address of the factory contract.
        address: ALL_MARKETS,
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem(
          "event SetLiquidationEngine(address indexed oldLiquidationEngine, address indexed newLiquidationEngine)"
        ),
        parameter: "newLiquidationEngine",
      }),
      startBlock: 9740174,
    },
  },
});
