import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, env } from "@/lib/config";

/** Routes that require a signed-in user. Sub-paths (e.g. /customers/123) match too. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/opportunities",
  "/customers",
  "/campaigns",
  "/activity",
  "/settings",
  "/team",
  "/billing",
];

// Note: "/pricing" is deliberately NOT protected — Phase 16's pricing page
// is public marketing, viewable signed out.

/** Routes an already-signed-in user shouldn't see — bounce them to the dashboard instead. */
const AUTH_ONLY_PREFIXES = ["/login", "/signup"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

/**
 * Runs on every request (see `middleware.ts`'s matcher). Two jobs:
 *
 * 1. Refresh the Supabase session cookie so it never silently expires while
 *    the user is active (the standard @supabase/ssr middleware pattern).
 * 2. Redirect based on auth state *before* a protected page ever renders,
 *    so an unauthenticated visitor never even briefly sees protected UI.
 *
 * If Supabase isn't configured yet (no project created), this intentionally
 * no-ops rather than locking every route behind a login nobody can complete —
 * same "degrade gracefully" approach Phase 2 used for the health check.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured) {
    return supabaseResponse;
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() (not getSession()) revalidates the token against Supabase Auth
  // itself, rather than trusting an unverified cookie — required for a check
  // running in middleware/server code per Supabase's own guidance.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && matchesPrefix(pathname, AUTH_ONLY_PREFIXES)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
