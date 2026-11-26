import "server-only";
import { createDb, type Db } from "@/db/client";

// One connection pool per server process (and per dev hot-reload, via globalThis).
const g = globalThis as { __recipeDb?: ReturnType<typeof createDb> };

export function getDb(): Db {
  g.__recipeDb ??= createDb();
  return g.__recipeDb.db;
}
