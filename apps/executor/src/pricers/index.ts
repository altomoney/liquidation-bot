import { PricerName } from "@/config/types";
import { ChainlinkPricer } from "./chainlink";
import { DefiLlamaPricer } from "./defillama";
import { MorphoPricer } from "./morpho";
import { StablecoinPricer } from "./stablecoin";
import { Pricer } from "./types";
import { UniswapV3Pricer } from "./uniswapV3";

export * from "./chainlink";
export * from "./defillama";
export * from "./morpho";
export * from "./stablecoin";
export * from "./types";
export * from "./uniswapV3";

export const createPricer = (pricerName: PricerName): Pricer => {
  switch (pricerName) {
    case "chainlink":
      return new ChainlinkPricer();
    case "defillama":
      return new DefiLlamaPricer();
    case "morpho":
      return new MorphoPricer();
    case "uniswapV3":
      return new UniswapV3Pricer();
    case "stablecoin":
      return new StablecoinPricer();
    default:
      throw new Error(`Unknown pricer: ${pricerName}`);
  }
};
