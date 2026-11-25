// Drizzle is used for typed queries only. The schema is owned by supabase/migrations;
// db/schema.ts is generated from the live local DB with `pnpm db:pull`. Never use generate/push.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./db/introspect",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
