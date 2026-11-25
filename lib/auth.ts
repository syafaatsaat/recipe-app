import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for identity. Every page, action and route that touches user
 * data gets the user id from here, never from the client or from proxy.ts.
 * getClaims() verifies the JWT (never use getSession() on the server: it trusts
 * the cookie without checking it).
 */
export async function getUser(): Promise<{ id: string; email: string | null } | null> {
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

/** Only same-site relative paths, so ?next= can't send someone to another site. */
export function safeNext(next: unknown, fallback = "/recipes"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
