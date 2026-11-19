// DB bootstrap: SQLite file in dev, Postgres when DATABASE_URL is set. Query code elsewhere
// uses only the dialect-neutral drizzle API (select/insert/delete/where), so it runs on both.
import * as sqliteSchema from "./schema";
import * as pgSchema from "./schema.pg";

const DDL = (big: string) => [
  `CREATE TABLE IF NOT EXISTS sec_cache (url TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS packs (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, ticker TEXT NOT NULL, cik TEXT NOT NULL, name TEXT NOT NULL,
    exchange TEXT, fetched_at TEXT NOT NULL, quarters INTEGER NOT NULL, metrics_covered INTEGER NOT NULL,
    metrics_omitted INTEGER NOT NULL, pack_bytes INTEGER NOT NULL, tenk_bytes INTEGER,
    pack_json TEXT NOT NULL, meta_json TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS packs_owner_ticker ON packs (owner_id, ticker)`,
  `CREATE TABLE IF NOT EXISTS rate_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, at ${big} NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS rate_events_lookup ON rate_events (owner_id, kind, at)`,
];

export type Store = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  t: typeof sqliteSchema;
};

let store: Promise<Store> | null = null;

async function open(): Promise<Store> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: 5 });
    for (const s of DDL("BIGINT")) await client.unsafe(s);
    return { db: drizzle(client), t: pgSchema as unknown as typeof sqliteSchema };
  }
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(process.env.SQLITE_PATH || "contextpack.db");
  sqlite.pragma("journal_mode = WAL");
  for (const s of DDL("INTEGER")) sqlite.exec(s);
  return { db: drizzle(sqlite), t: sqliteSchema };
}

export function getStore(): Promise<Store> {
  return (store ||= open());
}
