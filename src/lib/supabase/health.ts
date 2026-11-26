import { env, isSupabaseConfigured } from "@/lib/config";

export type HealthCheckResult =
  | { ok: true; status: "connected"; checkedAt: string }
  | { ok: false; status: "not_configured" | "unreachable"; message: string; checkedAt: string };

/**
 * Verifies the App -> Supabase -> Database chain. Hits the real `businesses`
 * table with a `select id, limit 1` — with RLS enabled this returns HTTP 200
 * (with an empty array for an unauthenticated/anon caller) as long as the
 * network, the anon/publishable key, and the underlying Postgres database
 * are all working, which is exactly what the rest of the app relies on.
 *
 * Earlier this hit the bare `/rest/v1/` root endpoint (PostgREST's OpenAPI
 * schema dump). Supabase's newer API key system restricts that specific
 * endpoint to secret keys only — anon/publishable keys now get a 401 there
 * even though they work fine against every real table, which made this
 * check report "unreachable" for a connection that was actually fine.
 * Querying a real table instead keeps this check honest about what the app
 * actually needs to work.
 */
export async function checkSupabaseConnection(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      status: "not_configured",
      message: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.",
      checkedAt,
    };
  }

  try {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/businesses?select=id&limit=1`, {
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: "unreachable",
        message: `Supabase responded with HTTP ${response.status}.`,
        checkedAt,
      };
    }

    return { ok: true, status: "connected", checkedAt };
  } catch (error) {
    return {
      ok: false,
      status: "unreachable",
      message: error instanceof Error ? error.message : "Unknown network error.",
      checkedAt,
    };
  }
}
