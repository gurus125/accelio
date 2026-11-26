/**
 * The only place in the app that actually calls Meta's WhatsApp Cloud API.
 * Plain `fetch`, server-only, never imported from a client component.
 * `WHATSAPP_ACCESS_TOKEN` never leaves this process.
 */

import { WHATSAPP_GRAPH_API_VERSION, whatsappEnv } from "./config";
import type { MetaSendResult } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

interface SendTextParams {
  to: string;
  body: string;
}

interface SendTemplateParams {
  to: string;
  templateName: string;
  languageCode: string;
  /** Positional body variables, filling {{1}}, {{2}}, ... in the approved
   * template — never the AI's free-form sentence (see send.ts). */
  bodyParameters: string[];
}

async function callMetaSendApi(
  phoneNumberId: string,
  payload: Record<string, unknown>
): Promise<MetaSendResult> {
  if (!whatsappEnv.accessToken || !phoneNumberId) {
    return { ok: false, error: "WhatsApp isn't connected." };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whatsappEnv.accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      // Full detail stays server-side only — never returned to the client.
      console.error(
        "[whatsapp] Meta API error",
        response.status,
        (json as { error?: { message?: string } })?.error?.message ?? "(no detail)"
      );
      return { ok: false, error: mapMetaErrorToFriendlyMessage(response.status, json) };
    }

    const providerMessageId = (json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
    if (typeof providerMessageId !== "string") {
      console.error("[whatsapp] Meta API returned no message id.");
      return { ok: false, error: "WhatsApp temporarily couldn't process the message." };
    }

    return { ok: true, providerMessageId };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "WhatsApp temporarily couldn't process the message." };
    }
    console.error("[whatsapp] Network error calling Meta.", error instanceof Error ? error.message : error);
    return { ok: false, error: "WhatsApp temporarily couldn't process the message." };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapMetaErrorToFriendlyMessage(status: number, json: unknown): string {
  const code = (json as { error?: { code?: number } } | null)?.error?.code;

  if (status === 401 || status === 403) return "WhatsApp isn't configured correctly right now.";
  // Re-engagement outside the customer service window without a template.
  if (code === 131047) return "This message needs an approved template to reach this customer right now.";
  // Template not found / not approved / parameter mismatch.
  if (code === 132000 || code === 132001 || code === 132012) return "This message template isn't available.";
  // Invalid recipient number.
  if (code === 131026 || code === 131030) return "This customer's WhatsApp number couldn't be reached.";
  return "WhatsApp temporarily couldn't process the message.";
}

export async function sendWhatsAppText(phoneNumberId: string, params: SendTextParams): Promise<MetaSendResult> {
  return callMetaSendApi(phoneNumberId, {
    messaging_product: "whatsapp",
    to: params.to,
    type: "text",
    text: { body: params.body },
  });
}

export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  params: SendTemplateParams
): Promise<MetaSendResult> {
  return callMetaSendApi(phoneNumberId, {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      components: params.bodyParameters.length
        ? [
            {
              type: "body",
              parameters: params.bodyParameters.map((text) => ({ type: "text", text })),
            },
          ]
        : undefined,
    },
  });
}

/** Verifies a phone_number_id is real and reachable with the current
 * token — used when an owner connects WhatsApp in Settings, so a
 * connection is never marked "connected" without actually checking. */
export async function verifyPhoneNumberId(
  phoneNumberId: string
): Promise<{ ok: true; displayPhoneNumber: string | null } | { ok: false; error: string }> {
  if (!whatsappEnv.accessToken) {
    return { ok: false, error: "WhatsApp isn't connected yet — no access token is configured." };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${whatsappEnv.accessToken}` } }
    );
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[whatsapp] Phone number verification failed", response.status);
      return { ok: false, error: "Couldn't verify this phone number with WhatsApp. Double-check the Phone Number ID." };
    }

    return { ok: true, displayPhoneNumber: (json as { display_phone_number?: string })?.display_phone_number ?? null };
  } catch {
    return { ok: false, error: "Couldn't reach WhatsApp right now. Please try again." };
  }
}
