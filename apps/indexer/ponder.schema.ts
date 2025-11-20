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
    ltv: t.bigint().notNull(),
    lltv: t.bigint().notNull(),
    tLltv: t.bigint().notNull(),
    dynamicBonusFeeDecaySteepness: t.bigint().notNull(),
    dynamicBonusFeeStart: t.bigint().notNull(),
    liquidationBaseFee: t.bigint().notNull(),
    minPenaltyPercentage: t.bigint().notNull(),
    protocolFeePercentage: t.bigint().notNull(),
    type: marketType().notNull(),

    totalSupplyAssets: t.bigint().notNull().default(0n),
    totalSupplyShares: t.bigint().notNull().default(0n),
    totalBorrowAssets: t.bigint().notNull().default(0n),
    totalBorrowShares: t.bigint().notNull().default(0n),
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
