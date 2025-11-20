import { schema } from "ponder:internal";

export type MarketDb = typeof schema.market.$inferSelect;
export type PositionDb = typeof schema.position.$inferSelect;
