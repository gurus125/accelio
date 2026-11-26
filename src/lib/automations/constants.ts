/**
 * Phase 14 safety constants. Every number here exists in exactly one place —
 * nothing in this module should hardcode a second value for the same idea.
 */

import { RECOMMENDATION_CONTACT_COOLDOWN_DAYS } from "@/lib/recommendations/constants";

/**
 * Re-exported, NOT re-defined: spec step 15 explicitly says to check for an
 * existing cooldown value first and reuse it rather than invent a second,
 * conflicting one. This is the same 7-day value Phase 12's recommendations
 * already use for "don't re-contact someone we just messaged."
 */
export const AUTOMATION_CONTACT_COOLDOWN_DAYS = RECOMMENDATION_CONTACT_COOLDOWN_DAYS;

/** Business-wide ceiling on automated sends per calendar day. Once hit, the
 * scheduler stops sending for the rest of that day for that business and
 * records why (spec step 16) — it does not silently keep going. */
export const MAX_AUTOMATED_MESSAGES_PER_BUSINESS_PER_DAY = 50;

/** Per-customer ceiling across a rolling 30 days, counted across ALL
 * automations combined — one automation cannot bypass this by itself, and
 * neither can several automations acting together (spec step 17). */
export const MAX_AUTOMATED_MESSAGES_PER_CUSTOMER_PER_30_DAYS = 2;

/**
 * Business-hours window automated sends are confined to (spec step 22).
 * There is no per-business configuration for this yet — no such field
 * exists anywhere in the schema — so this is a single, centralized default
 * matching the spec's own example (9am-8pm). A trigger outside this window
 * is never sent late; it is simply re-evaluated on a later scheduler tick
 * once the window reopens (see eligibility.ts / executor.ts).
 */
export const AUTOMATION_BUSINESS_HOURS_START_HOUR = 9;
export const AUTOMATION_BUSINESS_HOURS_END_HOUR = 20;

/**
 * No per-business timezone field exists anywhere in the schema (Phase
 * 4-13). Rather than inventing a whole timezone-configuration system for
 * this phase (explicitly out of scope per spec step 21), every business is
 * assumed to operate in India Standard Time — true for every business this
 * product currently serves, and consistent with the rest of the app's
 * Indian-mobile-only phone handling (`lib/whatsapp/phone.ts`).
 */
export const ASSUMED_BUSINESS_TIMEZONE = "Asia/Kolkata";

/** Delay choices offered in the create-automation wizard's Step 3 (spec
 * step 20's "10 minutes" example, plus a few natural neighbors). Minutes. */
export const AUTOMATION_DELAY_OPTIONS_MINUTES = [0, 10, 60, 1440] as const;

/** Safety cap on how many candidates a single scheduler tick will evaluate
 * for one automation, so a business with an unusually large customer list
 * can never turn one tick into an unbounded amount of work (or, combined
 * with a bug, an unbounded number of WhatsApp calls). Well above what any
 * real business hits in normal operation given the daily send cap above. */
export const MAX_AUTOMATION_CANDIDATES_PER_TICK = 200;

/** Bounded concurrency for actually dispatching messages within one tick —
 * mirrors `SEND_CONCURRENCY` in `lib/campaigns/send.ts`, the established
 * pattern for "never unbounded `Promise.all` over real WhatsApp sends." */
export const AUTOMATION_SEND_CONCURRENCY = 3;

/** Prefix used to tag every automation-sent message's `opportunity_type`
 * column (e.g. "automation:new_lead_followup") so analytics and the
 * message list can tell automated sends apart from manual/campaign ones
 * without any schema change (spec step 36). */
export const AUTOMATION_OPPORTUNITY_TYPE_PREFIX = "automation:";
