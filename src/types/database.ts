import type { ConsentSource } from "@/lib/consent";
import type {
  TemplateCategory,
  TemplateKey,
  TemplateLanguage,
  TemplateStatus,
  TemplateVariable,
  TemplateVariant,
} from "@/lib/templates/catalog";
import type { DerivedCustomerStatus } from "@/lib/customers/status";
/**
 * Row shapes for the Phase 4 Supabase tables. These mirror
 * `supabase/migrations/0001_phase4_core_schema.sql` exactly — if a column
 * changes there, it should change here too.
 */

import type { CustomerStatus } from "@/types";

export interface BusinessRow {
  id: string;
  owner_id: string;
  name: string;
  business_type: string | null;
  owner_name: string | null;
  city: string | null;
  phone: string | null;
  /** Phase 14 emergency stop (Settings -> Automations -> Pause all):
   * when set, the scheduler must not execute ANY automation for this
   * business, regardless of each automation's own status. Never cleared
   * automatically. */
  automations_paused_at: string | null;
  /** Milestone 1 — IANA zone for every "today"/date/hour decision
   * (migration 0017). Defaults to Asia/Kolkata; read it via
   * `getBusinessTimeZone()` so a missing/invalid value falls back safely. */
  timezone?: string | null;
  /** Milestone 2 (migration 0020) — language for WhatsApp templates. */
  whatsapp_language?: TemplateLanguage | null;
  /** Milestone 2 — parlour "discreet" mode: reminders never name the service. */
  discreet_reminders?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  /** Deprecated (Milestone 1): the old manual status. No longer written or
   * shown — use the engine-derived status (src/lib/customers/status.ts). */
  status: CustomerStatus;
  tags: string[];
  notes: string | null;
  /** Milestone 1 (migration 0018) — see src/lib/consent.ts. */
  whatsapp_consent: boolean;
  consent_source: ConsentSource | null;
  consent_at: string | null;
  opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerEventType = "visit" | "note" | "other";

export interface CustomerEventRow {
  id: string;
  business_id: string;
  customer_id: string;
  event_type: CustomerEventType;
  service: string | null;
  amount: number | null;
  occurred_at: string;
  notes: string | null;
  created_at: string;
  /** Phase 15 — which team member logged this (null for CSV-imported /
   * system-generated events, or events created before this column existed). */
  created_by: string | null;
}

/** A customer row plus basic stats derived from its `customer_events` — no
 * "opportunity" intelligence, just honest counts and sums. */
export interface RealCustomer extends CustomerRow {
  visitCount: number;
  totalSpent: number;
  lastVisitAt: string | null;
  /** Milestone 1 — computed by the opportunity engine (see
   * src/lib/customers/status.ts); `status` (the old manual column) is no
   * longer shown or edited anywhere. */
  derivedStatus: DerivedCustomerStatus;
}

/** Phase 13 — a person who has voluntarily expressed interest via a
 * business's website but has not (yet) been established as a customer.
 * Mirrors `supabase/migrations/0008_phase13_leads.sql`'s `leads` table. */
export type LeadSource =
  | "website"
  | "website_brochure"
  | "website_pricing"
  | "website_contact"
  | "website_booking"
  | "manual"
  | "other";

export type LeadStatus = "new" | "contacted" | "replied" | "qualified" | "converted" | "lost";

export type LeadConsentStatus = "given" | "not_recorded";

export interface LeadRow {
  id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  source: LeadSource;
  source_url: string | null;
  interest: string | null;
  message: string | null;
  status: LeadStatus;
  consent_status: LeadConsentStatus | null;
  consent_text: string | null;
  consent_given_at: string | null;
  /** Milestone 1 — set when the lead replies STOP on WhatsApp. */
  opted_out_at?: string | null;
  captured_at: string;
  last_contacted_at: string | null;
  converted_at: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One business's public website lead-capture form configuration. The
 * `widget_key` is the only field ever exposed to a website's client-side
 * JS — see lib/leads/widget-public.ts. */
export interface LeadWidgetRow {
  id: string;
  business_id: string;
  widget_key: string;
  button_text: string;
  intro_text: string | null;
  consent_text: string;
  default_source: Exclude<LeadSource, "manual" | "other">;
  interest_options: string[];
  accent_color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Phase 15 — a user's access to a business: role (owner/staff) and status
 * (active/suspended). `name`/`email` are denormalized snapshots from
 * invite/accept time — there's no `profiles` table, so this is how the
 * Team page and audit trails show a person's name without extra API calls. */
export type BusinessMemberRole = "owner" | "staff";
export type BusinessMemberStatus = "active" | "suspended";

export interface BusinessMemberRow {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessMemberRole;
  status: BusinessMemberStatus;
  name: string | null;
  email: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface BusinessInvitationRow {
  id: string;
  business_id: string;
  email: string;
  name: string | null;
  role: BusinessMemberRole;
  invited_by: string;
  status: BusinessInvitationStatus;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TeamAuditEventType =
  | "staff_invited"
  | "invitation_accepted"
  | "invitation_revoked"
  | "invitation_resent"
  | "staff_removed";

export interface TeamAuditLogRow {
  id: string;
  business_id: string;
  actor_id: string | null;
  event_type: TeamAuditEventType;
  target_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * One row per business's billing state. `plan_id` intentionally doesn't
 * reference a `plans` table: plans are centralized in code (see
 * `lib/billing/plans.ts`), not database-driven, so this is just the id
 * that indexes into that config. `provider_subscription_id` is null for
 * every Free-plan business, permanently — Free never talks to Razorpay at
 * all, so it lives in `status: "active"` indefinitely with no Razorpay
 * object ever existing. `"trial"` is kept as a status value purely for
 * reuse (nothing currently puts a subscription into it — every new
 * business starts on Free, not a trial). */
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "expired";

export interface SubscriptionRow {
  id: string;
  business_id: string;
  plan_id: "free" | "starter" | "growth";
  provider: "razorpay";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  /** Set when a paid plan is scheduled to end on Free rather than being
   * left in a blocked "cancelled" state — the webhook reads this once the
   * Razorpay cancellation actually completes and lands the business on
   * this plan with `status: "active"` instead. `null` the rest of the
   * time (including for a paid -> paid switch, which reschedules a new
   * checkout instead of landing on any fallback plan). */
  downgrade_to_plan_id: "free" | null;
  created_at: string;
  updated_at: string;
}

/** Phase 16 — append-only webhook/audit log, deduped on
 * `(provider, provider_event_id)` so a retried Razorpay delivery is never
 * double-applied. */
export interface BillingEventRow {
  id: string;
  business_id: string | null;
  provider: "razorpay";
  provider_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

/**
 * Business-defined expected return interval per service name — tier 1 of
 * the opportunity engine's baseline hierarchy (see
 * `lib/opportunities/service-defaults.ts` for tiers 2-3, the built-in
 * defaults this overrides). Matched case-insensitively against
 * `customer_events.service` at read time.
 */
export interface ServiceBaselineRow {
  id: string;
  business_id: string;
  service: string;
  expected_return_days: number;
  created_at: string;
  updated_at: string;
}

export type RecurringScheduleIntervalType = "monthly";
export type RecurringScheduleStatus = "active" | "paused";

/**
 * A per-customer calendar-anchored recurring reminder (e.g. a monthly
 * coaching fee due on the join-date anniversary). Deliberately separate
 * from the opportunity engine — see `lib/recurring-schedules/`.
 */
export interface RecurringScheduleRow {
  id: string;
  business_id: string;
  customer_id: string;
  label: string;
  anchor_date: string;
  interval_type: RecurringScheduleIntervalType;
  status: RecurringScheduleStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Milestone 2 — `message_templates` (migration 0020). */
export interface MessageTemplateRow {
  id: string;
  business_id: string;
  key: TemplateKey;
  language: TemplateLanguage;
  meta_language_code: string;
  variant: TemplateVariant;
  name: string;
  category: TemplateCategory;
  body: string;
  variables: TemplateVariable[];
  status: TemplateStatus;
  provider_template_id: string | null;
  rejection_reason: string | null;
  status_checked_at: string | null;
  created_at: string;
  updated_at: string;
}
