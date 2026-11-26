/**
 * Milestone 1 — verification of Meta's X-Hub-Signature-256 webhook header.
 *
 * In production (NODE_ENV=production) the app secret is REQUIRED: without
 * it every webhook request is refused, because an unsigned request could
 * be forged by anyone to inject fake "replies", fake STOPs or fake
 * delivery statuses. Outside production an unset secret is allowed (Meta
 * can't reach localhost anyway) and the request is accepted with a warning.
 *
 * Pure (Node's crypto only, no Supabase) so it is unit-tested.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type WebhookSignatureCheck =
  | { accept: true; verified: true }
  | { accept: true; verified: false; warning: string }
  | { accept: false; status: 401 | 503; reason: string };

export function isValidMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const provided = Buffer.from(signatureHeader);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function checkWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
  nodeEnv: string | undefined;
}): WebhookSignatureCheck {
  if (params.appSecret) {
    return isValidMetaSignature(params.rawBody, params.signatureHeader, params.appSecret)
      ? { accept: true, verified: true }
      : { accept: false, status: 401, reason: "Invalid or missing X-Hub-Signature-256." };
  }
  if (params.nodeEnv === "production") {
    return {
      accept: false,
      status: 503,
      reason: "WHATSAPP_APP_SECRET is not set; webhooks are refused in production until it is.",
    };
  }
  return {
    accept: true,
    verified: false,
    warning: "WHATSAPP_APP_SECRET is not set — accepting webhook without signature verification (development only).",
  };
}
