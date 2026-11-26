/**
 * The one place in the app that actually calls OpenAI. Deliberately a
 * plain `fetch` (no `openai` SDK dependency) so this stays a small,
 * auditable server-only function — never imported from a client component.
 *
 * Cost control: this is only ever invoked from the `/api/ai/generate-message`
 * route in direct response to an explicit user click (see that route and
 * `MessageGenerator`'s "Generate message" button), or from the Phase 10
 * campaign message endpoint, also only on an explicit click — nothing
 * calls this on page load, on render, or in a loop.
 */

import { buildSystemPrompt, buildUserPrompt, buildLeadSystemPrompt, buildLeadUserPrompt } from "./prompts";
import type { GenerateMessageRequest, GenerateMessageResult, GenerateLeadMessageRequest, GenerateLeadMessageResult } from "./types";

/** Small, fast, inexpensive chat model — plenty for a 30-80 word message. */
const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;

const GENERIC_ERROR = "We couldn't generate a message right now. Please try again.";

/**
 * Low-level call shared by Phase 7's per-customer generation and Phase
 * 10's per-campaign generation — both need identical OpenAI error
 * handling, timeout behavior, and JSON-shape validation; only the prompt
 * text differs. Never exported outside `lib/ai/`.
 */
async function callOpenAiForMessage(
  systemPrompt: string,
  userPrompt: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "AI message generation isn't set up yet — an OpenAI API key needs to be added to the environment.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      // Never log or surface the key itself — just that it's misconfigured.
      console.error("[ai/generate-message] OpenAI rejected the request (auth) — check OPENAI_API_KEY.");
      return { ok: false, error: "AI message generation isn't configured correctly right now." };
    }

    if (response.status === 429) {
      return {
        ok: false,
        error: "We're generating a lot of messages right now — please try again in a moment.",
      };
    }

    if (!response.ok) {
      console.error(`[ai/generate-message] OpenAI responded with HTTP ${response.status}.`);
      return { ok: false, error: GENERIC_ERROR };
    }

    const payload = (await response.json()) as unknown;
    const rawContent = extractMessageContent(payload);
    if (rawContent === null) {
      return { ok: false, error: "We couldn't generate the message. Please try again." };
    }

    const parsed = safeJsonParse(rawContent);
    if (!isValidGeneratedMessagePayload(parsed)) {
      return { ok: false, error: "We couldn't generate the message. Please try again." };
    }

    return { ok: true, message: parsed.message.trim() };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Message generation took too long. Please try again." };
    }
    console.error("[ai/generate-message] Network error calling OpenAI.", error instanceof Error ? error.message : error);
    return { ok: false, error: GENERIC_ERROR };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateMessage(request: GenerateMessageRequest): Promise<GenerateMessageResult> {
  const result = await callOpenAiForMessage(buildSystemPrompt(), buildUserPrompt(request));
  if (!result.ok) return result;
  return {
    ok: true,
    data: { message: result.message, tone: request.tone, language: request.language },
  };
}

/** Shared with `lib/ai/generate-campaign-message.ts` (Phase 10). */
export { callOpenAiForMessage };

export async function generateLeadMessage(request: GenerateLeadMessageRequest): Promise<GenerateLeadMessageResult> {
  const result = await callOpenAiForMessage(buildLeadSystemPrompt(), buildLeadUserPrompt(request));
  if (!result.ok) return result;
  return {
    ok: true,
    data: { message: result.message, tone: request.tone, language: request.language },
  };
}


function extractMessageContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  return typeof content === "string" ? content : null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidGeneratedMessagePayload(value: unknown): value is { message: string } {
  if (typeof value !== "object" || value === null) return false;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim().length > 0;
}
