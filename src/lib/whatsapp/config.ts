/**
 * Server-only WhatsApp/Meta configuration. Deliberately its own file,
 * never imported from a "use client" component — the same separation
 * Phase 7 used for the OpenAI key. Centralizes the Graph API version so
 * bumping it later means changing one line, not hunting through the app.
 */

export const WHATSAPP_GRAPH_API_VERSION = "v21.0";

export const whatsappEnv = {
  /** Shared Meta System User access token for this MVP — see the Phase 8
   * migration's comment on `whatsapp_connections` for why this isn't yet
   * per-business. Never sent to the browser. */
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  /** Optional default, pre-filled into the Settings connection form for
   * convenience — the actual number used to send is always read from the
   * current business's own `whatsapp_connections` row, never from env. */
  defaultPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  defaultBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "",
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  /** Verifies webhook requests came from Meta (X-Hub-Signature-256).
   * Required in production (see src/lib/whatsapp/signature.ts). Templates
   * are no longer configured here — they live in `message_templates`. */
  appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
} as const;

/** True once the one thing every send needs — the access token — is
 * present. Per-business phone_number_id comes from the database, checked
 * separately (see `queries.ts`'s `getWhatsAppConnection`). */
export const isWhatsAppEnvConfigured = Boolean(whatsappEnv.accessToken);
