import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappEnv } from "@/lib/whatsapp/config";
import { handleStatusEvent } from "@/lib/whatsapp/webhooks/status";
import { handleInboundMessages } from "@/lib/whatsapp/webhooks/inbound";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/whatsapp — Meta's webhook verification handshake.
 * Configure this exact URL in Meta's App Dashboard (WhatsApp > Configuration
 * > Webhook), along with the same value as WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && whatsappEnv.verifyToken && token === whatsappEnv.verifyToken) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp — Meta's message status callbacks (sent,
 * delivered, read, failed) AND inbound customer messages (Phase 9).
 *
 * Uses the service-role client (see `@/lib/supabase/admin`) because these
 * requests come from Meta's servers, not a signed-in Reelo user — there is
 * no session/auth.uid() for RLS to key off. Status updates correlate via
 * `provider_message_id` (see `lib/whatsapp/webhooks/status.ts`); inbound
 * messages attribute to a business via `phone_number_id` (see
 * `lib/whatsapp/webhooks/inbound.ts`) — never via anything the sender
 * controls.
 *
 * Processing is idempotent throughout: Meta retries webhook deliveries, and
 * a duplicate event must never duplicate a message, a status change, or a
 * reply. See the unique indexes on `message_events` / `customer_messages`
 * added in the Phase 9 migration.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (whatsappEnv.appSecret) {
    const signatureHeader = request.headers.get("x-hub-signature-256");
    if (!isValidMetaSignature(rawBody, signatureHeader, whatsappEnv.appSecret)) {
      console.error("[webhook/whatsapp] Rejected request with invalid/missing signature.");
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  } else {
    // No app secret configured — payload authenticity can't be verified.
    // Fine for local development, but this should be set before any real
    // production traffic reaches this endpoint.
    console.warn("[webhook/whatsapp] WHATSAPP_APP_SECRET is not set — accepting webhook without signature verification.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Meta expects a fast 200 even for a payload we can't parse — there's
    // nothing further to do with malformed input.
    return NextResponse.json({ ok: true });
  }

  try {
    await processWebhookPayload(payload);
  } catch (error) {
    // Never let a processing error surface Meta's payload or our internals
    // back to the caller — just log and still acknowledge receipt.
    console.error("[webhook/whatsapp] Failed to process payload.", error instanceof Error ? error.message : error);
  }

  return NextResponse.json({ ok: true });
}

function isValidMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function processWebhookPayload(payload: unknown): Promise<void> {
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return;

  const admin = createAdminClient();

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as { value?: unknown })?.value as
        | { statuses?: unknown; messages?: unknown; metadata?: { phone_number_id?: unknown } }
        | undefined;
      if (!value) continue;

      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          await handleStatusEvent(admin, status as never);
        }
      }

      if (Array.isArray(value.messages)) {
        const phoneNumberId = typeof value.metadata?.phone_number_id === "string" ? value.metadata.phone_number_id : null;
        await handleInboundMessages(admin, phoneNumberId, value.messages);
      }
    }
  }
}
