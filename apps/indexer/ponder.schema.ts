import {
  index,
  onchainEnum,
  onchainTable,
  primaryKey,
  relations,
} from "ponder";

// Markets
export const marketType = onchainEnum("marketType", [
  "mint",
  "borrow",
  "dao_mint",
]);

export const irmType = onchainEnum("irmType", ["fixed", "adaptive"]);

export const market = onchainTable(
  "market",
  (t) => ({
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),

    loanToken: t.hex().notNull(),
    collateralToken: t.hex().notNull(),
    feeRecipient: t.hex().notNull(),
    oracle: t.hex().notNull(),
    irm: t.hex(),
    liquidationEngine: t.hex().notNull(),
    ltv: t.bigint().notNull(),
    type: marketType().notNull(),
    isActive: t.boolean().notNull().default(true),

    totalSupplyAssets: t.bigint().notNull().default(0n),
    totalSupplyShares: t.bigint().notNull().default(0n),
    totalBorrowAssets: t.bigint().notNull().default(0n),
    totalBorrowShares: t.bigint().notNull().default(0n),

    paused: t.boolean().notNull().default(false),
  }),
  (table) => ({
    // Composite primary key uniquely identifies a market across chains
    pk: primaryKey({ columns: [table.chainId, table.address] }),
  })
);

export const marketRelations = relations(market, ({ many, one }) => ({
  positions: many(position),
  irm: one(irm, {
    fields: [market.chainId, market.address, market.irm],
    references: [irm.chainId, irm.marketAddress, irm.address],
  }),
  liquidationEngine: one(liquidationEngine, {
    fields: [market.chainId, market.address, market.liquidationEngine],
    references: [
      liquidationEngine.chainId,
      liquidationEngine.marketAddress,
      liquidationEngine.address,
    ],
  }),
}));

// Positions
export const position = onchainTable(
  "position",
  (t) => ({
    chainId: t.integer().notNull(),
    marketId: t.hex().notNull(),
    user: t.hex().notNull(),

    // Position fields
    supplyShares: t.bigint().notNull().default(0n),
    borrowShares: t.bigint().notNull().default(0n),
    collateral: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    // Composite primary key uniquely identifies a position across chains
    pk: primaryKey({ columns: [table.chainId, table.marketId, table.user] }),
    // Index speeds up relational queries
    marketIdx: index().on(table.chainId, table.marketId),
  })
);

export const positionRelations = relations(position, ({ one }) => ({
  market: one(market, {
    fields: [position.chainId, position.marketId],
    references: [market.chainId, market.address],
  }),
}));

// IRMs
export const irm = onchainTable(
  "irm",
  (t) => ({
    chainId: t.integer().notNull(),
    marketAddress: t.hex().notNull(),
    address: t.hex().notNull(),
    type: irmType().notNull(),
    config: t.json(),
    state: t.json(),
  }),
  (table) => ({
    pk: primaryKey({
      columns: [table.chainId, table.address],
    }),
  })
);

export const irmRelations = relations(irm, ({ one }) => ({
  market: one(market, {
    fields: [irm.chainId, irm.address],
    references: [market.chainId, market.irm],
  }),
}));

// Liquidation Engines
export const liquidationEngineType = onchainEnum("liquidationEngineType", [
  "DlbDcfPriorityLiquidationEngine",
]);

export const liquidationEngine = onchainTable(
  "liquidationEngine",
  (t) => ({
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),
    marketAddress: t.hex().notNull(),
    type: liquidationEngineType().notNull(),
    config: t.json(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.address] }),
  })
);

export const liquidationEngineRelations = relations(
  liquidationEngine,
  ({ one }) => ({
    market: one(market, {
      fields: [
        liquidationEngine.chainId,
        liquidationEngine.marketAddress,
        liquidationEngine.address,
      ],
      references: [market.chainId, market.address, market.liquidationEngine],
    }),
  })
);

export const dusdConfig = onchainTable(
  "dusdConfig",
  (t) => ({
    chainId: t.integer().notNull(),
    minterAddress: t.hex().notNull(),
    minterStatus: t.boolean().notNull().default(false),
    burnerStatus: t.boolean().notNull().default(false),
    minterCeiling: t.bigint().notNull().default(0n),
    currentlyMinted: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.minterAddress] }),
  })
);

// Markets
export const usmType = onchainEnum("usmType", [
  "permissioned",
  "permissionless",
]);

export const usm = onchainTable(
  "usm",
  (t) => ({
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),

    stableToken: t.hex().notNull(),
    underlyingAsset: t.hex().notNull(),
    underlyingExposureCap: t.bigint().notNull().default(0n),
    currentExposure: t.bigint().notNull().default(0n),

    type: usmType().notNull(),

    dusdConfig: t.hex().notNull(),
    isActive: t.boolean().notNull().default(true),
    swapsFrozen: t.boolean().notNull().default(false),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.address] }),
  })
);

export const usmRelations = relations(usm, ({ one }) => ({
  dusdConfig: one(dusdConfig, {
    fields: [usm.chainId, usm.address],
    references: [dusdConfig.chainId, dusdConfig.minterAddress],
  }),
}));
