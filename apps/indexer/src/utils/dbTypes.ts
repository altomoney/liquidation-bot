import schema from "ponder:schema";
import { schema as internalSchema } from "ponder:internal";

export type IrmDb = typeof schema.irm.$inferSelect;
export type LiquidationEngineDb = typeof schema.liquidationEngine.$inferSelect;
export type MarketDb = typeof internalSchema.market.$inferSelect;
export type PositionDb = typeof internalSchema.position.$inferSelect;
export type DusdConfigDb = typeof internalSchema.dusdConfig.$inferSelect;
export type UsmDb = typeof internalSchema.usm.$inferSelect;
