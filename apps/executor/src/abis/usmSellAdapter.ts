export const usmSellAdapterAbi = [
  {
    inputs: [],
    name: "AdapterCallFailed",
    type: "error",
  },
  {
    inputs: [],
    name: "InsufficientBalance",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "underlyingAsset",
        type: "address",
      },
      {
        internalType: "address",
        name: "usm",
        type: "address",
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "maxAmount",
        type: "uint256",
      },
    ],
    name: "sellAssetFromSenderBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "assetSold",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "stableOut",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
