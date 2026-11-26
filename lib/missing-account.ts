// Pure, so it can be unit-tested; lib/auth.ts re-exports it.

/**
 * True when a write failed because the signed-in account no longer exists. Its token is
 * still validly signed (getClaims() checks the signature, not the database), so the
 * first write is where it shows: the row's owner_id foreign key rejects it. Happens
 * after an account is deleted, or locally after `pnpm db:reset`.
 */
export function isMissingAccount(e: unknown): boolean {
  let x: unknown = e;
  for (let depth = 0; depth < 5 && x && typeof x === "object"; depth++) {
    const o = x as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (o.code === "23503" && typeof o.constraint_name === "string" && o.constraint_name.endsWith("owner_id_fkey")) return true;
    x = o.cause; // Drizzle wraps the driver's error
  }
  return false;
}
