export const IAltoLiquidationEngineAbi = [
  {
    type: "function",
    name: "LIQUIDATION_ENGINE_TYPE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "enum LiquidationEngineType",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "market",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minLltv",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "prepareLiquidation",
    inputs: [
      {
        name: "input",
        type: "tuple",
        internalType: "struct LiquidationEngineInput",
        components: [
          {
            name: "borrower",
            type: "address",
            internalType: "address",
          },
          {
            name: "liquidator",
            type: "address",
            internalType: "address",
          },
          {
            name: "totalSupply",
            type: "tuple",
            internalType: "struct Balance",
            components: [
              {
                name: "assets",
                type: "uint128",
                internalType: "uint128",
              },
              {
                name: "shares",
                type: "uint128",
                internalType: "uint128",
              },
            ],
          },
          {
            name: "totalBorrowed",
            type: "tuple",
            internalType: "struct Balance",
            components: [
              {
                name: "assets",
                type: "uint128",
                internalType: "uint128",
              },
              {
                name: "shares",
                type: "uint128",
                internalType: "uint128",
              },
            ],
          },
          {
            name: "position",
            type: "tuple",
            internalType: "struct Position",
            components: [
              {
                name: "supplyShares",
                type: "uint128",
                internalType: "uint128",
              },
              {
                name: "borrowShares",
                type: "uint128",
                internalType: "uint128",
              },
              {
                name: "collateralAssets",
                type: "uint128",
                internalType: "uint128",
              },
            ],
          },
          {
            name: "maxLtv",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "collateralPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "liquidationData",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        internalType: "struct LiquidationEngineResult",
        components: [
          {
            name: "seizedCollateralAssets",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "repaidBorrowShares",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "repaidBorrowAmount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "protocolSeizedCollateralFee",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "protocolFeePercentage",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setMarketOnce",
    inputs: [
      {
        name: "_market",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "SetMarketOnce",
    inputs: [
      {
        name: "market",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
] as const;
