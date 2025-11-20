import schema from "ponder:schema";

export interface IIrm {
  updateInterestRate(
    totalSupply: bigint,
    totalBorrowed: bigint,
    nowSeconds: bigint
  ): { interest: bigint; newBorrowRate: bigint };
}

export type IrmDb = typeof schema.irm.$inferSelect;
