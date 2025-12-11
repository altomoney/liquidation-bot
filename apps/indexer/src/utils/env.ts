import assert from "assert";
import { Address } from "viem";

assert(process.env.CHAIN_ID, "CHAIN_ID env var is not set");
assert(process.env.PONDER_RPC_URL, "PONDER_RPC_URL env var is not set");
assert(
  process.env.MARKET_REGISTRY_ADDRESS,
  "MARKET_REGISTRY_ADDRESS env var is not set"
);
assert(process.env.START_BLOCK, "START_BLOCK env var is not set");

const CHAIN_ID = Number(process.env.CHAIN_ID);
const MARKET_REGISTRY_ADDRESS = process.env.MARKET_REGISTRY_ADDRESS as Address;
const RPC_URL = process.env.PONDER_RPC_URL;
const START_BLOCK = Number(process.env.START_BLOCK);

export const ENV = {
  CHAIN_ID,
  CHAIN_ID_STRING: CHAIN_ID.toFixed(0),
  MARKET_REGISTRY_ADDRESS,
  RPC_URL,
  START_BLOCK,
};
