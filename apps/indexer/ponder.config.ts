import { createConfig, factory } from "ponder";

import { parseAbiItem } from "viem";
import { AdaptiveCurveIrmAbi } from "./abis/AdaptiveCurveIrmAbi";
import { AdvancedPermissionsUSM } from "./abis/AdvancedPermissionsUsmAbi";
import { AltoBorrowMarketAbi } from "./abis/AltoBorrowMarketAbi";
import { AltoMintMarketAbi } from "./abis/AltoMintMarketAbi";
import { DlbDcfPriorityLiquidationEngineAbi } from "./abis/DlbDcfPriorityLiquidationEngineAbi";
import { DusdAbi } from "./abis/DusdAbi";
import { DusdUsmAbi } from "./abis/DusdUsmAbi";
import { FixedRateIrmAbi } from "./abis/FixedRateIrmAbi";
import { MarketRegistryAbi } from "./abis/MarketRegistryAbi";
import { UsmRegistryAbi } from "./abis/UsmRegistryAbi";
import { ENV } from "./src/utils/env";

export default createConfig({
  chains: {
    [ENV.CHAIN_ID_STRING]: {
      id: ENV.CHAIN_ID,
      rpc: ENV.RPC_URL,
    },
  },
  contracts: {
    Dusd: {
      abi: DusdAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: ENV.DUSD_ADDRESS,
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    UsmRegistry: {
      abi: UsmRegistryAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: ENV.USM_REGISTRY_ADDRESS,
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    Usm: {
      chain: ENV.CHAIN_ID_STRING,
      abi: DusdUsmAbi,
      address: factory({
        // Address of the factory contract.
        address: ENV.USM_REGISTRY_ADDRESS,
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem("event UsmAdded(address indexed usm)"),
        parameter: "usm",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    AdvancedPermissionsUsm: {
      chain: ENV.CHAIN_ID_STRING,
      abi: AdvancedPermissionsUSM,
      address: factory({
        address: ENV.USM_REGISTRY_ADDRESS,
        event: parseAbiItem("event UsmAdded(address indexed usm)"),
        parameter: "usm",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    MarketRegistry: {
      abi: MarketRegistryAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: ENV.MARKET_REGISTRY_ADDRESS,
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    AltoBorrowMarket: {
      chain: ENV.CHAIN_ID_STRING,
      abi: AltoBorrowMarketAbi,
      address: factory({
        // Address of the factory contract.
        address: ENV.MARKET_REGISTRY_ADDRESS,
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem("event BorrowMarketAdded(address indexed market)"),
        parameter: "market",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    AltoMintMarket: {
      abi: AltoMintMarketAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: factory({
        // Address of the factory contract.
        address: ENV.MARKET_REGISTRY_ADDRESS,
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem("event MintMarketAdded(address indexed market)"),
        parameter: "market",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    FixedRateIrm: {
      abi: FixedRateIrmAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: factory({
        // Discover IRMs from SetIrm events emitted by any market.
        event: parseAbiItem(
          "event SetIrm(address indexed oldAddr, address indexed newAddr)",
        ),
        parameter: "newAddr",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    AdaptiveCurveIrm: {
      abi: AdaptiveCurveIrmAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: factory({
        // Discover IRMs from SetIrm events emitted by any market.
        event: parseAbiItem(
          "event SetIrm(address indexed oldAddr, address indexed newAddr)",
        ),
        parameter: "newAddr",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
    DlbDcfPriorityLiquidationEngine: {
      abi: DlbDcfPriorityLiquidationEngineAbi,
      chain: ENV.CHAIN_ID_STRING,
      address: factory({
        // Discover engines from SetLiquidationEngine events emitted by any market.
        event: parseAbiItem(
          "event SetLiquidationEngine(address indexed oldLiquidationEngine, address indexed newLiquidationEngine)",
        ),
        parameter: "newLiquidationEngine",
      }),
      startBlock: ENV.START_BLOCK,
      endBlock: ENV.DEV_END_BLOCK,
    },
  },
  database: ENV.POSTGRES_DATABASE_URL
    ? {
        kind: "postgres",
        connectionString: ENV.POSTGRES_DATABASE_URL,
      }
    : undefined,
});
