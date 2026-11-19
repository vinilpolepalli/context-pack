import { defineConfig } from "drizzle-kit";

const pg = !!process.env.DATABASE_URL;
export default defineConfig({
  schema: pg ? "./lib/db/schema.pg.ts" : "./lib/db/schema.ts",
  dialect: pg ? "postgresql" : "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL || "contextpack.db" },
});
