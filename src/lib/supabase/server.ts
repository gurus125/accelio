import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. Reads/writes auth cookies via `next/headers`, which is what lets
 * Phase 3's real authentication work without any changes to this file.
 *
 * Call this fresh per request — Supabase server clients are not meant to be
 * module-level singletons because they close over that request's cookies.
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    );
  }

  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` is called from a Server Component in some Next.js
          // versions, where cookie writes are ignored. Safe to no-op here
          // as long as middleware refreshes the session (added in Phase 3).
        }
      },
    },
  });
}
