"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; fields?: { email?: string } };

const email = z.email("Enter a valid email address.").trim().toLowerCase();
const newPassword = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don’t match.", fields: { email: parsed.data.email } };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: newPassword }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/recipes` },
  });
  if (error) return { error: error.message, fields: { email: parsed.data.email } };
  // No session means the project requires email confirmation (hosted default).
  if (!data.session) return { message: "Check your email for a link to finish signing up." };
  redirect("/recipes");
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await origin()}/auth/confirm?next=/reset-password`,
  });
  // Same answer whether or not the account exists, so this can't be used to find accounts.
  return { message: "If that email has an account, a reset link is on its way. Open it in this browser." };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = newPassword.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "That reset link has expired. Ask for a new one." };
  redirect("/recipes");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
