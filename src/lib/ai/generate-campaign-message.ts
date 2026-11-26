/**
 * Phase 10 — generates ONE reusable message template for a whole campaign
 * audience, reusing the same OpenAI call/error-handling as Phase 7's
 * per-customer generation (`callOpenAiForMessage` in generate-message.ts).
 * Called at most once per owner click when creating/regenerating a
 * campaign message — never once per recipient (see the Phase 10 spec's
 * cost-control rule).
 */

import { buildCampaignSystemPrompt, buildCampaignUserPrompt } from "./prompts";
import { callOpenAiForMessage } from "./generate-message";
import type { CampaignAudienceContext, GenerateCampaignMessageResult } from "./types";

export async function generateCampaignMessage(
  context: CampaignAudienceContext
): Promise<GenerateCampaignMessageResult> {
  const result = await callOpenAiForMessage(buildCampaignSystemPrompt(), buildCampaignUserPrompt(context));
  if (!result.ok) return result;
  return {
    ok: true,
    data: { message: result.message, tone: context.tone, language: context.language },
  };
}
