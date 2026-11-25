import { sql } from "drizzle-orm";
import type { Db, Tx } from "./client";

/**
 * Run queries as a Supabase user so Row Level Security applies.
 *
 * Drizzle connects as `postgres`, which BYPASSES RLS. Every user-scoped query must
 * go through this: it opens a transaction, switches to the `authenticated` role and
 * sets the JWT claims that `auth.uid()` reads. Both settings are transaction-local
 * (`set_config(..., true)`), so they can't leak to other requests on a pooled connection.
 *
 * `userId` must come from a verified session (supabase.auth.getUser()), never from client input.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true),
                                set_config('role', 'authenticated', true)`);
    return fn(tx);
  });
}
