import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing page for email links (sign-up confirmation, password reset).
 * Handles both link styles: PKCE `?code=` (the default template) and
 * `?token_hash=&type=` (custom templates).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const supabase = await createClient();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("missing code") };

  if (error) return NextResponse.redirect(new URL("/login?error=link", request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
