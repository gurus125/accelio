/**
 * Phase 14 — plain-language copy for automation concepts. Per the spec's
 * "no complex workflow builder" / "no technical jargon" rules: an owner
 * should be able to read a label and immediately understand it, never see
 * words like "trigger", "workflow", "entity", or "invoke".
 */

import type { AutomationActionType, AutomationRunStatus, AutomationStatus, AutomationType } from "./types";

export const AUTOMATION_TYPE_LABELS: Record<AutomationType, string> = {
  new_lead_followup: "New website lead follow-up",
  due_for_return: "Due-for-return reminder",
  follow_up_reminder: "Follow-up reminder",
  service_reminder: "Service reminder",
  recurring_schedule: "Recurring calendar reminder",
};

/** One plain sentence describing WHEN each automation type fires — the
 * spec's own bar ("an owner must be able to understand an automation in
 * one sentence"). */
export const AUTOMATION_TYPE_TRIGGER_DESCRIPTIONS: Record<AutomationType, string> = {
  new_lead_followup: "When a new website lead arrives",
  due_for_return: "When a customer becomes due to return",
  follow_up_reminder: "When a follow-up becomes due",
  service_reminder: "When a customer is due for a service reminder",
  recurring_schedule: "On each customer's recurring date (e.g. a monthly fee anniversary)",
};

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionType, string> = {
  send_whatsapp: "Send an approved WhatsApp message",
  create_recommendation: "Create a recommendation for you to review and send",
};

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const AUTOMATION_RUN_STATUS_LABELS: Record<AutomationRunStatus, string> = {
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
  eligible: "Eligible",
};

/** Builds the one-sentence summary shown on an automation's card, e.g.
 * "When a new website lead arrives, send an approved WhatsApp follow-up
 * after 10 minutes." */
export function describeAutomationInPlainLanguage(params: {
  automationType: AutomationType;
  actionType: AutomationActionType;
  delayMinutes: number;
}): string {
  const trigger = AUTOMATION_TYPE_TRIGGER_DESCRIPTIONS[params.automationType];
  const action =
    params.actionType === "send_whatsapp" ? "send this approved WhatsApp message" : "create a recommendation for you";
  const delay = describeDelayInPlainLanguage(params.delayMinutes);
  return `${trigger}, ${action}${delay ? ` ${delay}` : " right away"}.`;
}

export function describeDelayInPlainLanguage(delayMinutes: number): string {
  if (delayMinutes <= 0) return "";
  if (delayMinutes < 60) return `after ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"}`;
  if (delayMinutes < 1440) {
    const hours = Math.round(delayMinutes / 60);
    return `after ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(delayMinutes / 1440);
  return `after ${days} day${days === 1 ? "" : "s"}`;
}

/** Human-readable reason shown next to a skipped/failed run — never the raw
 * internal reason code, never a technical stack trace. */
export const RUN_SKIP_REASON_COPY: Record<string, string> = {
  no_phone: "No phone number on file",
  invalid_phone: "Phone number couldn't be confirmed as a valid WhatsApp number",
  consent_unclear: "Communication permission is unclear, so no automated message was sent",
  opted_out: "They replied STOP and opted out of WhatsApp messages",
  no_consent: "They haven't agreed to WhatsApp messages yet",
  recently_contacted: "Already contacted recently — waiting out the cooldown",
  conflicting_active_message: "Another message to this person is already in progress",
  unanswered_reply: "They replied and haven't been responded to yet — needs a human reply",
  recently_returned: "Customer has already returned — no longer due",
  automation_not_active: "This automation isn't active",
  business_paused: "All automations are currently paused for this business",
  outside_business_hours: "Outside business hours — will be picked up in the next allowed window",
  delay_not_elapsed: "Still waiting out the configured delay",
  daily_limit_reached: "Today's automated message limit for this business was reached",
  customer_limit_reached: "This person has already received the maximum automated messages this month",
  duplicate_execution: "Already handled — nothing more to do",
  missing_template: "No approved message is set up for this automation yet",
  whatsapp_not_connected: "WhatsApp isn't connected for this business yet",
};
