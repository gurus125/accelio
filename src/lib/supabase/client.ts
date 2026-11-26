"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * Supabase client for use in Client Components ("use client").
 *
 * No auth or data fetching is wired up in Phase 2 — this only establishes
 * the connection pattern later phases (auth, customer data) will build on.
 * Throws clearly if called before `NEXT_PUBLIC_SUPABASE_URL` /
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, rather than failing silently.
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    );
  }
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
