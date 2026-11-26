import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links Supabase Auth emails out (signup confirmation,
 * password recovery). Exchanges the one-time `code` for a real session,
 * then sends the user wherever the link said to go next.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or the exchange failed (expired/used link) — send them back to
  // login with a hint rather than a dead end.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
