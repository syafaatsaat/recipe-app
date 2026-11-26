import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

const AUTH_PAGES = ["/login", "/signup"];
const PROTECTED_PREFIXES = ["/recipes"];

/**
 * Refreshes the Supabase session cookie on every request, then does optimistic
 * redirects. This is a convenience, not the security boundary: every page and
 * action that touches user data checks the user again via lib/auth.ts, and RLS
 * checks it a third time in the database.
 */
export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // no-store headers: a response that sets auth cookies must never be cached
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  // Don't put code between client creation and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  let target: string | null = null;
  if (path === "/") target = signedIn ? "/recipes" : "/login";
  else if (!signedIn && PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    target = `/login?next=${encodeURIComponent(path + request.nextUrl.search)}`;
  } else if (signedIn && AUTH_PAGES.includes(path)) target = "/recipes";

  if (!target) return response;
  const redirect = NextResponse.redirect(new URL(target, request.url));
  // carry refreshed cookies and cache headers over to the redirect
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const h of ["cache-control", "expires", "pragma"]) {
    const v = response.headers.get(h);
    if (v) redirect.headers.set(h, v);
  }
  return redirect;
}
