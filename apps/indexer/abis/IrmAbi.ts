export const IrmAbi = [
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
    name: "onMarketPause",
    inputs: [
      {
        name: "_paused",
        type: "bool",
        internalType: "bool",
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
        name: "_market",
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
        name: "totalSupply",
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
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateInterestRateView",
    inputs: [
      {
        name: "totalSupply",
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
] as const;
