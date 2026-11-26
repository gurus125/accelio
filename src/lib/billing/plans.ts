/**
 * The single source of truth for what a plan is: its price, display copy,
 * and every usage limit it enforces. Nothing outside this file should
 * ever hardcode a price or a limit number — every enforcement check
 * (staff seats, customers, AI generations, WhatsApp sends, campaigns,
 * automations) reads from here, keyed by `PlanId`, so adding another plan
 * or changing a limit later means editing this one file.
 *
 * Prices are in paise (INR's smallest unit) to match Razorpay's own APIs,
 * which always take integer amounts — never a float rupee value.
 *
 * FREE is a permanent, ongoing plan — not a time-limited trial. A
 * business can stay on it indefinitely; there is no expiry, no automatic
 * conversion, and no card requirement. It does not go through Razorpay at
 * all (see `razorpayPlanIdEnvVar` below), since no payment is ever taken
 * for it. Only Starter and Growth require a Razorpay subscription.
 */

export type PlanId = "free" | "starter" | "growth";

export interface PlanLimits {
  /** Total customers a business may have on file. `null` = unlimited. */
  maxCustomers: number | null;
  /** Staff seats, on top of the one owner. Reuses Phase 15's
   * `countStaffSeatsUsed` — this is just the number that count is compared
   * against, replacing the old flat `MAX_STAFF_PER_BUSINESS` constant. */
  maxStaff: number;
  /** AI-generated messages (per `lib/ai/generate-message.ts`'s single
   * OpenAI call site) allowed per billing period. */
  maxAiGenerationsPerMonth: number;
  /** WhatsApp messages actually accepted by Meta (customer sends, lead
   * sends, campaign sends, and automation sends all count against this
   * one shared pool) per billing period. */
  maxWhatsappMessagesPerMonth: number;
  /** Campaigns created per billing period. */
  maxCampaignsPerMonth: number;
  /** Automations that may be active (status = "active") at once. */
  maxActiveAutomations: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  priceInPaise: number;
  currency: "INR";
  billingPeriod: "monthly";
  /** Name of the env var holding this plan's Razorpay Plan ID (created
   * once, out of band, via the Razorpay Dashboard or API — see
   * `.env.example` for how). Kept as an env var rather than a hardcoded
   * id because a Plan ID is specific to one Razorpay account (test vs
   * live keys each have their own), so it can never be a source constant.
   * `undefined` for Free, which never talks to Razorpay — there is
   * nothing to check out or subscribe to. */
  razorpayPlanIdEnvVar?: `RAZORPAY_PLAN_ID_${string}`;
  limits: PlanLimits;
  /** Short, plain-language bullets for the pricing page — not a technical
   * dump of the limits above, which read fine as a comparison table but
   * badly as marketing copy. */
  highlights: string[];
}

/** Retained for reuse (trial infrastructure is not deleted, only
 * unused): the length of the old time-boxed trial. Nothing reads this
 * anymore — Free has no expiry — but the `status = 'trial'` DB value and
 * `trial_started_at`/`trial_ends_at` columns are left in place in case a
 * future time-boxed promotion wants them again. */
export const TRIAL_DURATION_DAYS = 14;

/** The plan every new business starts on, permanently, until it chooses
 * to upgrade. Free, no card required, no expiry. */
export const DEFAULT_PLAN_ID: PlanId = "free";

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Start using Reelo and see how it works for your business.",
    priceInPaise: 0,
    currency: "INR",
    billingPeriod: "monthly",
    limits: {
      maxCustomers: 100,
      maxStaff: 1,
      maxAiGenerationsPerMonth: 20,
      maxWhatsappMessagesPerMonth: 50,
      maxCampaignsPerMonth: 1,
      maxActiveAutomations: 1,
    },
    highlights: [
      "Up to 100 customers",
      "1 staff account",
      "20 AI-generated messages / month",
      "50 WhatsApp messages / month",
      "1 campaign / month",
      "1 active automation",
      "Daily recommendations",
      "Website lead capture",
      "Basic analytics",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For a single business finding its footing.",
    priceInPaise: 69_900,
    currency: "INR",
    billingPeriod: "monthly",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_STARTER",
    limits: {
      maxCustomers: 500,
      maxStaff: 2,
      maxAiGenerationsPerMonth: 200,
      maxWhatsappMessagesPerMonth: 1_000,
      maxCampaignsPerMonth: 4,
      maxActiveAutomations: 3,
    },
    highlights: [
      "Up to 500 customers",
      "2 staff accounts",
      "200 AI-generated messages / month",
      "1,000 WhatsApp messages / month",
      "4 campaigns / month",
      "3 active automations",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "For a business ready to scale outreach.",
    priceInPaise: 129_900,
    currency: "INR",
    billingPeriod: "monthly",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_GROWTH",
    limits: {
      maxCustomers: 5_000,
      maxStaff: 5,
      maxAiGenerationsPerMonth: 1_000,
      maxWhatsappMessagesPerMonth: 5_000,
      maxCampaignsPerMonth: 20,
      maxActiveAutomations: 10,
    },
    highlights: [
      "Up to 5,000 customers",
      "5 staff accounts",
      "1,000 AI-generated messages / month",
      "5,000 WhatsApp messages / month",
      "20 campaigns / month",
      "10 active automations",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth"];

/** Plans that require a Razorpay subscription. Free is deliberately
 * excluded — it is granted directly, with no payment provider involved. */
export const PAID_PLAN_ORDER: PlanId[] = ["starter", "growth"];

export function getPlan(planId: PlanId): PlanDefinition {
  return PLANS[planId];
}

export function isPlanId(value: string): value is PlanId {
  return value === "free" || value === "starter" || value === "growth";
}

export function isPaidPlanId(value: PlanId): value is "starter" | "growth" {
  return value === "starter" || value === "growth";
}

/** Formats a paise amount as a rupee price string for display, e.g.
 * `priceInPaise: 69900` -> "₹699". Reelo's plans are always whole-rupee
 * amounts, so this never needs to show paise. Free's `priceInPaise` is 0;
 * callers wanting the "₹0 forever" pricing-page copy handle that
 * separately rather than through this generic formatter. */
export function formatPlanPrice(plan: PlanDefinition): string {
  const rupees = plan.priceInPaise / 100;
  return `₹${rupees.toLocaleString("en-IN")}`;
}
