import { LiquidityVenueName } from "@/config/types";
import { OneInch } from "./1inch";
import { Erc20Wrapper } from "./erc20Wrapper";
import { Erc4626 } from "./erc4626";
import { MidasVenue } from "./midas";
import { PendlePTVenue } from "./pendlePT";
import { LiquidityVenue } from "./types";
import { UniswapV3Venue } from "./uniswapV3";
import { UniswapV4Venue } from "./uniswapV4";

export * from "./1inch";
export * from "./erc20Wrapper";
export * from "./erc4626";
export * from "./midas";
export * from "./pendlePT";
export * from "./uniswapV3";
export * from "./uniswapV4";
export * from "./usm";

export const createLiquidityVenue = (
  liquidityVenueName: LiquidityVenueName,
): LiquidityVenue => {
  switch (liquidityVenueName) {
    case "1inch":
      return new OneInch();
    case "erc20Wrapper":
      return new Erc20Wrapper();
    case "erc4626":
      return new Erc4626();
    case "midas":
      return new MidasVenue();
    case "pendlePT":
      return new PendlePTVenue();
    case "uniswapV3":
      return new UniswapV3Venue();
    case "uniswapV4":
      return new UniswapV4Venue();
    default:
      throw new Error(`Unknown liquidity venue: ${liquidityVenueName}`);
  }
};
