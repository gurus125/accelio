/**
 * Centralized, typed access to environment configuration.
 *
 * Nothing in this file hardcodes a secret, URL, or business value — it only
 * reads `process.env` once and gives the rest of the app a single, typed
 * place to ask "what environment am I in?" and "is Supabase configured?".
 */

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
} as const;

export const isProduction = env.nodeEnv === "production";
export const isDevelopment = env.nodeEnv === "development";

/**
 * True once real Supabase credentials are present. Phase 2 ships with no
 * schema and (usually) no project yet, so every consumer of Supabase must
 * check this before assuming the client will work, rather than crashing at
 * import time when the env vars are missing.
 */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
