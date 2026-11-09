export const PegResponsiveExponentialIrmAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "initialPegOracle",
        type: "address",
        internalType: "address",
      },
      {
        name: "initialConfig",
        type: "tuple",
        internalType: "struct PegResponsiveExponentialIrmConfig",
        components: [
          {
            name: "recoveryPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "stressPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "baseRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "stressRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maxRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "doublingDistance",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "recoveryDelay",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "maxOracleAge",
            type: "uint48",
            internalType: "uint48",
          },
        ],
      },
      {
        name: "initialOwner",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "IRM_TYPE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "enum IRMType",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_BORROW_RATE",
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
    name: "MAX_EXPONENT_INPUT",
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
    name: "MAX_RECOVERY_PRICE",
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
    name: "acceptOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "irState",
    inputs: [],
    outputs: [
      {
        name: "borrowRate",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "lastUpdate",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "recoveryStartedAt",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "stressMode",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "irmConfig",
    inputs: [],
    outputs: [
      {
        name: "recoveryPrice",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "stressPrice",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "baseRate",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "stressRate",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "maxRate",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "doublingDistance",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "recoveryDelay",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "maxOracleAge",
        type: "uint48",
        internalType: "uint48",
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
    name: "onMarketPause",
    inputs: [
      {
        name: "paused",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "owner",
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
    name: "pegOracle",
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
    name: "pendingOwner",
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
    name: "previewBorrowRate",
    inputs: [],
    outputs: [
      {
        name: "priceWad",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "observedAt",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "oracleValid",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "borrowRate",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setIrmConfig",
    inputs: [
      {
        name: "newConfig",
        type: "tuple",
        internalType: "struct PegResponsiveExponentialIrmConfig",
        components: [
          {
            name: "recoveryPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "stressPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "baseRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "stressRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maxRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "doublingDistance",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "recoveryDelay",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "maxOracleAge",
            type: "uint48",
            internalType: "uint48",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMarket",
    inputs: [
      {
        name: "newMarket",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPegOracle",
    inputs: [
      {
        name: "newPegOracle",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "targetBorrowRate",
    inputs: [
      {
        name: "priceWad",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "borrowRate",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnershipSkip2Step",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateInterestRate",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "totalBorrowed",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "interest",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "borrowRate",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateInterestRateView",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "totalBorrowed",
        type: "uint256",
        internalType: "uint256",
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
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BorrowRateUpdated",
    inputs: [
      {
        name: "prev",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "curr",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "priceWad",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "observedAt",
        type: "uint48",
        indexed: false,
        internalType: "uint48",
      },
      {
        name: "oracleValid",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "IRStateUpdated",
    inputs: [
      {
        name: "newIRState",
        type: "tuple",
        indexed: false,
        internalType: "struct IRState",
        components: [
          {
            name: "borrowRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "lastUpdate",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "recoveryStartedAt",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "stressMode",
            type: "bool",
            internalType: "bool",
          },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferStarted",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetIrmConfig",
    inputs: [
      {
        name: "newConfig",
        type: "tuple",
        indexed: false,
        internalType: "struct PegResponsiveExponentialIrmConfig",
        components: [
          {
            name: "recoveryPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "stressPrice",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "baseRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "stressRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maxRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "doublingDistance",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "recoveryDelay",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "maxOracleAge",
            type: "uint48",
            internalType: "uint48",
          },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetPegOracle",
    inputs: [
      {
        name: "oldPegOracle",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newPegOracle",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "StressStateUpdated",
    inputs: [
      {
        name: "stressMode",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
      {
        name: "recoveryStartedAt",
        type: "uint48",
        indexed: false,
        internalType: "uint48",
      },
      {
        name: "priceWad",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "IrmInvalidParams",
    inputs: [],
  },
  {
    type: "error",
    name: "IrmMarketAlreadySet",
    inputs: [],
  },
  {
    type: "error",
    name: "IrmMarketNotSet",
    inputs: [],
  },
  {
    type: "error",
    name: "IrmUnauthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "PegResponsiveExponentialIrmInvalidControllerConfig",
    inputs: [],
  },
  {
    type: "error",
    name: "PegResponsiveExponentialIrmInvalidOracle",
    inputs: [],
  },
  {
    type: "error",
    name: "PegResponsiveExponentialIrmInvalidPriceConfig",
    inputs: [],
  },
  {
    type: "error",
    name: "PegResponsiveExponentialIrmInvalidRateConfig",
    inputs: [],
  },
  {
    type: "error",
    name: "SafeCastOverflowedIntToUint",
    inputs: [
      {
        name: "value",
        type: "int256",
        internalType: "int256",
      },
    ],
  },
  {
    type: "error",
    name: "SafeCastOverflowedUintDowncast",
    inputs: [
      {
        name: "bits",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "value",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "SafeCastOverflowedUintToInt",
    inputs: [
      {
        name: "value",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
] as const;
