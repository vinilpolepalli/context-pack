// Postgres table definitions, same shape as lib/db/schema.ts.
import { pgTable, text, integer, bigint, uniqueIndex } from "drizzle-orm/pg-core";

export const secCache = pgTable("sec_cache", {
  url: text("url").primaryKey(),
  body: text("body").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const packs = pgTable(
  "packs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    ticker: text("ticker").notNull(),
    cik: text("cik").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange"),
    fetchedAt: text("fetched_at").notNull(),
    quarters: integer("quarters").notNull(),
    metricsCovered: integer("metrics_covered").notNull(),
    metricsOmitted: integer("metrics_omitted").notNull(),
    packBytes: integer("pack_bytes").notNull(),
    tenKBytes: integer("tenk_bytes"),
    packJson: text("pack_json").notNull(),
    metaJson: text("meta_json").notNull(),
  },
  (t) => [uniqueIndex("packs_owner_ticker").on(t.ownerId, t.ticker)],
);

export const rateEvents = pgTable("rate_events", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  at: bigint("at", { mode: "number" }).notNull(),
});
