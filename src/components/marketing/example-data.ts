/**
 * ILLUSTRATIVE MARKETING CONTENT — NOT LIVE PRODUCT DATA.
 *
 * Every value below is example/mock content used only to make the public
 * marketing homepage's product visuals (hero mockup, recommendations
 * showcase, WhatsApp example, lead-capture example, analytics preview)
 * concrete and readable. None of it is read from, or ever written to, the
 * real app — a signed-in business's actual customers, messages, and
 * analytics live entirely behind auth in the dashboard.
 *
 * Deliberately kept as one small set of plain data objects, separate from
 * every section's layout/JSX, so this can be swapped later for an
 * admin-panel- or CMS-managed feed without touching component code —
 * replace the values here (or point this module at a fetch) and every
 * section that imports it picks up the change.
 */

export const HERO_SUMMARY = {
  greeting: "Good morning",
  headline: "23 customers are worth contacting today",
  categories: [
    { value: 12, label: "Due to return" },
    { value: 6, label: "Inactive customers" },
    { value: 3, label: "Follow-ups" },
    { value: 2, label: "Service reminders" },
  ],
  customers: [
    { name: "Rahul Sharma", reason: "Due to return", daysAgo: 74, spentRupees: 4800 },
    { name: "Priya Verma", reason: "Inactive customer", daysAgo: 92, spentRupees: 7200 },
  ],
};

export const RECOMMENDATION_CATEGORIES = [
  "Due to return",
  "Inactive",
  "High-value inactive",
  "Follow-up",
  "Service reminder",
];

export const FEATURED_RECOMMENDATION = {
  name: "Rahul Sharma",
  daysAgo: 74,
  question: "Why contact Rahul?",
  reason: "Rahul normally visits every 45 days. It has been 74 days since his last visit.",
};

export const WHATSAPP_EXAMPLE = {
  name: "Rahul Sharma",
  reason: "Due to return",
  why: "Usually visits every 45 days. Last visit: 74 days ago.",
  message: "Hi Rahul! It's been a while since your last visit. We'd love to have you back at the salon. 😊",
};

export const LEAD_EXAMPLE = {
  name: "Ananya Singh",
  interest: "Hair Spa",
  source: "Website",
};

export const ANALYTICS_EXAMPLE = {
  customersContacted: 184,
  messagesDelivered: 171,
  replies: 43,
  returnedAfterOutreach: 27,
};

/** Relative weekly outreach activity for the small trend chart — unitless
 * illustrative shape only (not a real business's numbers). */
export const ACTIVITY_TREND = [30, 42, 38, 55, 61, 58, 72, 68, 80];
