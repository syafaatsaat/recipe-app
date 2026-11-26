import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export { isMissingAccount } from "./missing-account";

/**
 * Data Access Layer for identity. Every page, action and route that touches user
 * data gets the user id from here, never from the client or from proxy.ts.
 * getClaims() verifies the JWT (never use getSession() on the server: it trusts
 * the cookie without checking it).
 */
export async function getUser(): Promise<{ id: string; email: string | null } | null> {
  // Identity is always request-time: getClaims() checks the token's expiry against
  // the clock, which Next forbids while prerendering (blocking-prerender-current-time).
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
}

export async function requireUserId(): Promise<string> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user.id;
}

/** Ends the session of an account that no longer exists, and sends the visitor to sign in. */
export async function endMissingAccount(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut(); // clears the cookies even though the server no longer knows the user
  redirect("/login?error=gone");
}

/** Only same-site relative paths, so ?next= can't send someone to another site. */
export function safeNext(next: unknown, fallback = "/recipes"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
