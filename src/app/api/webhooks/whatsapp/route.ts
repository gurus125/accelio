import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappEnv } from "@/lib/whatsapp/config";
import { handleStatusEvent } from "@/lib/whatsapp/webhooks/status";
import { handleInboundMessages } from "@/lib/whatsapp/webhooks/inbound";
import { checkWebhookSignature } from "@/lib/whatsapp/signature";

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
 * requests come from Meta's servers, not a signed-in user — there is
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

  // Milestone 1 — the app secret is mandatory in production.
  const signature = checkWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    appSecret: whatsappEnv.appSecret,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!signature.accept) {
    console.error(`[webhook/whatsapp] Rejected request: ${signature.reason}`);
    return NextResponse.json({ ok: false }, { status: signature.status });
  }
  if (!signature.verified) console.warn(`[webhook/whatsapp] ${signature.warning}`);

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
