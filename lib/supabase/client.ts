import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

// The browser's Supabase client: the publishable key plus the user's session cookie,
// so everything it does is limited by RLS. Used for photo uploads (doc §3.12).
let client: ReturnType<typeof createBrowserClient> | null = null;

export function browserClient() {
  const { url, key } = supabaseEnv();
  client ??= createBrowserClient(url, key);
  return client;
}
