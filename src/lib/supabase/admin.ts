import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 *
 * Use this ONLY from trusted server-to-server code that has no user session
 * to scope queries by. Currently that's exactly one place: the Meta
 * WhatsApp webhook handler (`/api/webhooks/whatsapp`), which receives
 * calls from Meta's servers, not from a signed-in Accelio user, so there's no
 * `auth.uid()` for RLS to key off.
 *
 * Never import this from anything handling a browser request on a user's
 * behalf — use `@/lib/supabase/server`'s `createClient()` for that, which
 * is correctly scoped by RLS to the signed-in user's own business. Never
 * import this from a "use client" file; `SUPABASE_SERVICE_ROLE_KEY` must
 * never reach the browser.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!isSupabaseConfigured || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY (see .env.example)."
    );
  }

  return createSupabaseClient(env.supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
