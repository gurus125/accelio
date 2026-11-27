# Accelio

A customer marketing assistant for local businesses. This repo currently
contains **Phase 1** (a frontend prototype on mock data), **Phase 2** (a
clean, scalable technical foundation), **Phase 3** (real Supabase Auth),
**Phase 4** (a real, per-business customer database in Supabase Postgres with
Row Level Security), and **Phase 5** (CSV/Excel customer import with column
mapping, validation, and duplicate detection).

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Hand-authored shadcn/ui-style primitives in `src/components/ui/` (the
  shadcn CLI needs npm registry access, unavailable in the sandbox this was
  built in — see below)
- lucide-react icons
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`) — connection only, no
  schema yet

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Milestone 1 — pilot blockers (what changed)

- **Signup:** creating a business now also creates the owner's
  `business_members` row (DB trigger), so new signups aren't locked out.
- **Phones:** one normaliser (`src/lib/phone.ts`) stores every number as
  `+91XXXXXXXXXX` — manual entry, import, leads, webhook, everything.
  Customers → shows a report of possible duplicates / invalid numbers
  (nothing is merged automatically).
- **Import:** the last-visit date becomes a real `visit` event (plus an
  optional "Last Service" column), so imported customers are flagged as due.
- **Consent:** customers have `whatsapp_consent` / `consent_source` /
  `consent_at` / `opted_out_at`. Replying STOP / UNSUBSCRIBE / बंद opts
  out, START opts back in. Manual sends, campaigns, automations and
  recommendations skip anyone opted out or without recorded consent.
- **WhatsApp:** a `phone_number_id` can be connected to only one business.
  `WHATSAPP_APP_SECRET` is **required** when `NODE_ENV=production`.
- **Lists/analytics** page past Supabase's 1,000-row cap.
- **Time zone:** `businesses.timezone` (default `Asia/Kolkata`) drives
  "today", business hours, daily caps, recurring reminders and analytics.
- **Status** shown for a customer is derived from the opportunity engine;
  the manual dropdown is gone.

Apply migrations `0015`–`0019` in order (SQL Editor or `supabase db push`).

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own Supabase project's
values (Supabase Dashboard → Project Settings → API):

| Variable | Required? | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Without it, the app runs entirely on Phase 1 mock data — Settings shows "Not configured" instead of "Connected". |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Same as above. |

Once you do set these, also run the Phase 4 migration (see below) — without
it, Supabase is "connected" but the `businesses`/`customers`/`customer_events`
tables don't exist yet and real data pages will error.

Nothing in the codebase hardcodes a URL, key, or secret — `.env.local` is
gitignored, and `.env.example` only ever holds placeholders.

## Verifying the Supabase connection

- Visit `/settings` — the "Database connection" card shows live status
  (Connected / Not configured / Unreachable).
- Or call the health endpoint directly: `GET /api/health` returns
  `{ ok: true, status: "connected", checkedAt }` on success, or a
  `{ ok: false, status, message }` shape with a 503 otherwise.
- The check (`src/lib/supabase/health.ts`) hits Supabase's PostgREST root
  endpoint with the anon key. That endpoint only responds by querying
  Postgres for the schema, so a 200 confirms the whole chain — network →
  Supabase project → database — without requiring any tables to exist.

## Routes

| Route | Description |
| --- | --- |
| `/` | Marketing landing page |
| `/login` | Login screen (visual only) |
| `/signup` | Signup screen (visual only) |
| `/onboarding` | 4-step onboarding flow |
| `/dashboard` | Main "what should I do today" dashboard |
| `/opportunities` | All customer opportunities, filterable |
| `/customers` | Searchable, filterable customer list |
| `/customers/import` | CSV/Excel customer import wizard (Phase 5) |
| `/customers/[id]` | Customer profile, message composer, history |
| `/campaigns` | Campaign list |
| `/campaigns/new` | 3-step campaign creation flow |
| `/activity` | Communication activity feed + summary |
| `/settings` | Business profile, account (email + log out), WhatsApp, data, notifications, subscription, database connection |
| `/forgot-password` | Request a password reset email |
| `/reset-password` | Set a new password (only reachable via a valid reset link) |
| `/api/health` | Supabase connectivity check (JSON) |
| `/auth/callback` | Exchanges a confirmation/reset email link for a session, then redirects |

Unmatched routes render `src/app/not-found.tsx`; unhandled runtime errors
render `src/app/error.tsx` (both styled to match the rest of the app).

## Project structure

```
src/
  middleware.ts              Route protection + session refresh (runs on every request)
  app/
    (app)/                   Authenticated shell (sidebar + mobile nav)
      loading.tsx             Skeleton shown while a route segment loads
      dashboard/, customers/, opportunities/, campaigns/, activity/, settings/
    api/health/route.ts       Supabase health-check endpoint
    auth/callback/route.ts    Exchanges an email confirmation/reset link for a session
    login/, signup/           Real Supabase Auth forms
    forgot-password/, reset-password/
    onboarding/
    not-found.tsx             Styled 404
    error.tsx                 Styled error boundary
    page.tsx                  Landing page
  components/
    ui/                       Reusable primitives (Button, Card, Badge, Input, Modal, ...)
    layout/                   Sidebar, TopBar, MobileNav, nav config
    auth/                     PasswordField, AuthError, CheckEmailNotice, LogoutButton
    customers/                 CustomerCard, CustomerTable, CustomersContent
    opportunities/             OpportunityCard, OpportunitiesContent
    campaigns/                  CampaignCard
    *.tsx                      Cross-cutting components (StatusBadge, StatCard,
                                EmptyState, MessageComposer, WhatsappBubble,
                                SendWhatsappButton, SupabaseStatus)
  hooks/
    use-supabase-health.ts     Client hook wrapping /api/health
  lib/
    config.ts                  Typed env access (isProduction, isSupabaseConfigured, ...)
    auth/errors.ts              Maps raw Supabase error strings to friendly copy
    supabase/
      client.ts                 Browser Supabase client
      server.ts                 Server Supabase client (Server Components / Route Handlers)
      middleware.ts              Session refresh + route-protection logic used by middleware.ts
      health.ts                  The health-check implementation
    business/
      queries.ts                 getBusinessForCurrentUser / requireBusinessForCurrentUser
      actions.ts                 Server Actions: ensureBusinessForCurrentUser, updateBusinessProfile
    customers/
      queries.ts                 listCustomers, getCustomer, listEventsFor{Business,Customer}
      actions.ts                 Server Actions: create/update/deleteCustomer, addCustomerEvent
      mappers.ts                 computeCustomerStats, formatLastVisit (honest aggregates, no intelligence)
    dev/
      seed.ts                    Dev-only demo customer seeding (see Phase 4 section below)
    mock-data.ts                Mock customers, campaigns, activity feed (Phase 1 fallback)
    opportunity-engine.ts       Mock opportunity logic (Phase 1 fallback, /opportunities page only)
    utils.ts                    Formatting + className helpers
  types/
    index.ts                    Shared TypeScript types (Customer, Opportunity,
                                 Campaign, ActivityEvent, Business, ...)
    database.ts                  Real Supabase row types (BusinessRow, CustomerRow,
                                  CustomerEventRow, RealCustomer) — mirrors the Phase 4 migration
supabase/
  migrations/
    0001_phase4_core_schema.sql  businesses/customers/customer_events tables, indexes, RLS policies
```

The "opportunity engine" (`src/lib/opportunity-engine.ts`) is intentionally
kept separate from presentation — it's the piece most likely to be replaced by
a real backend/AI service in a later phase, so it's written as pure functions
that take a `Customer` and return an `Opportunity | null`. The Supabase
clients follow the same idea: `lib/supabase/client.ts` and `server.ts` are the
only two places later phases need to touch to add real auth and data.

## Authentication (Phase 3)

Real Supabase Auth — email + password, with signup, login, logout, session
persistence, protected routes, forgot/reset password, and optional email
confirmation. No customer database yet; the dashboard and every other page
still run entirely on mock data after login.

**Required Supabase Dashboard configuration** (Authentication → URL
Configuration), so confirmation/reset email links redirect back to this app
instead of failing:

- **Site URL**: `http://localhost:3000` in development; your real domain once deployed.
- **Redirect URLs**: add `http://localhost:3000/auth/callback` (and the
  production equivalent later). Without this, Supabase rejects the
  `emailRedirectTo` / `redirectTo` values this app passes and the links in
  confirmation/reset emails won't work.

Email confirmation is a toggle in Authentication → Providers → Email. This
app handles both settings correctly either way:
- **Confirmations ON** (Supabase's default): signup shows a "Check your
  email" screen and does not treat the user as logged in until they click
  the link.
- **Confirmations OFF**: signup logs the user in immediately and sends them
  to `/onboarding`.

**How the pieces fit together:**
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — runs on every
  request, refreshes the session cookie, and redirects unauthenticated
  visitors away from protected routes (and signed-in visitors away from
  `/login`/`/signup`) before any page renders.
- `src/app/(app)/layout.tsx` — a second, server-rendered check
  (`supabase.auth.getUser()`) as defense in depth for everything under the
  authenticated shell.
- `src/app/auth/callback/route.ts` — exchanges the one-time code from a
  confirmation/reset email link for a real session.
- `src/lib/auth/errors.ts` — turns raw Supabase error strings into the
  friendly messages shown in the UI.
- `src/components/auth/` — `PasswordField` (show/hide toggle),
  `AuthError` (inline banner), `CheckEmailNotice`, `LogoutButton`.

If `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` aren't set,
route protection no-ops (same graceful-degradation rule as Phase 2's health
check) rather than locking every page behind a login nobody can complete —
there's no session to protect against if no one can ever create one.

## Database & customer data (Phase 4)

Real `businesses`, `customers`, and `customer_events` tables in Supabase
Postgres, with mandatory Row Level Security enforcing that every user can
only ever see or modify their own business's rows.

**Setup — run this once per Supabase project:**

1. Open your Supabase project → SQL Editor.
2. Paste the contents of `supabase/migrations/0001_phase4_core_schema.sql`
   and run it (or apply it with the Supabase CLI: `supabase db push`). It's
   idempotent — safe to re-run.
3. That's it — no other configuration needed. RLS policies are created by
   the same migration.

**Schema:**

- `businesses` — one row per user (`owner_id` is unique, so V1 is one
  business per account), created idempotently the first time a signed-in
  user finishes onboarding (`ensureBusinessForCurrentUser`).
- `customers` — belongs to a `business_id`; `status` is one of `active`,
  `due`, `inactive`, `follow_up` — a plain field you set yourself, **not**
  computed from visit history. No opportunity/intelligence engine reads or
  writes this table.
- `customer_events` — a visit, note, or other logged activity for a
  customer. Used to compute honest, non-predictive stats (visit count, total
  spent, last visit) shown on the customer list/profile and dashboard.

**Tenant isolation — enforced twice:**

1. **Row Level Security** (the real boundary): every policy checks
   `auth.uid()` against `businesses.owner_id`, so Postgres itself will never
   return or accept a row belonging to someone else's business — regardless
   of what any query asks for.
2. **Server-side derivation**: every Server Action in `src/lib/business/` and
   `src/lib/customers/` looks up the caller's business via
   `requireBusinessForCurrentUser()` (which reads the session's
   `auth.getUser()`) and uses *that* `business_id` — a client can never pass
   its own `business_id` and have it trusted. A trigger on
   `customer_events` (`set_customer_event_business_id`) additionally forces
   `business_id` to match the event's `customer_id` on every write, as a
   third layer specific to that table.

**What's real now:**

- Business profile (Settings) reads and writes the real `businesses` row.
- Customers list reads real data, with client-side search/status filter
  (same UX as Phase 1, just backed by real rows scoped to your business).
- Full customer CRUD: add, edit, and delete customers.
- Customer profile shows real visit history (`customer_events`) and an
  "Add activity" button to log a new visit. "Communication history" is an
  explicit placeholder — WhatsApp messaging isn't wired up yet.
- Dashboard shows real, honest counts by status. It does **not** show
  "opportunities" — there's no intelligence engine over real data yet, and
  the dashboard says so explicitly rather than faking it.

**What's explicitly out of scope for Phase 4** (unchanged / not built):
CSV/Excel import, an opportunity/recommendation engine over real data
(the `/opportunities` page is still the Phase 1 mock demo, untouched),
AI, WhatsApp/Meta integration, campaign sending, and payments.

**Demo data (development only):** Settings → "Developer tools" (only
rendered when `NODE_ENV !== "production"`, and the server action itself
re-checks this — a client can't force it) adds a handful of realistic sample
customers with visit history, for trying the app with something other than
an empty list. It refuses to run if you already have customers, and it's
never referenced by any production code path.

## Customer import (Phase 5)

Bring an existing customer list in from a CSV or Excel file, at
`/customers/import` (also linked from the Customers page and its empty
state).

**Flow:** Upload → (pick a sheet, if the file has more than one) → Map
columns → Review → Import → Done. Nothing about CSVs, schemas, or database
fields is ever shown to the business owner — everything is plain language.

- **Parsing** happens entirely in the browser (`xlsx` reads both CSV and
  Excel) — the raw file is never uploaded anywhere. Only the rows the owner
  chooses to import ever reach the server, as plain JSON in batches.
- **Column mapping** (`src/lib/import/mapping.ts`) auto-suggests a mapping
  from common header names ("mobile number" → Phone, "total spent" → Total
  Spent, etc.) but the owner can always change it. Name and Phone are the
  only required fields.
- **Normalization** (`src/lib/import/normalize.ts`) handles the common
  Indian phone formats (`9876543210`, `+91 98765 43210`, `091-98765432...`,
  etc. → `+919876543210`), `₹4,800`-style amounts, and both ISO and
  day-first dates. A date that could be read two different ways (e.g.
  `01/06/2026`) is flagged rather than guessed at — the same rule applies to
  phone numbers that don't reduce to a plausible 10-digit number.
- **Validation** (`src/lib/import/validate.ts`) buckets every row as ready,
  warning, or invalid, with a plain-language reason attached to each issue
  (never a raw database error).
- **Duplicate detection** (`src/lib/import/duplicates.ts`) catches repeats
  within the file itself and rows that match a phone number already in your
  customer list — scoped strictly to the signed-in business, both
  client-side (via `getExistingPhonesForImport`, which returns only phone
  numbers, never full customer records) and again server-side on the actual
  insert. The first implementation always skips duplicates rather than
  overwriting existing data.
- **Import** (`src/lib/import/actions.ts`) runs in batches of 200 rows —
  several small Server Action calls instead of one huge request — so large
  files don't freeze the UI and the owner sees real progress between
  batches. `business_id` is derived from the session on every single batch,
  never accepted from the client; a unique index on
  `(customers.business_id, phone)` (see
  `supabase/migrations/0002_phase5_customer_phone_unique.sql`) is the
  database-level backstop if two imports ever raced each other.
- **Imported history**: if a row includes Total Spent, Visit Count, and/or
  Last Visit, one summarizing `customer_events` row is created for that
  customer (not fabricated individual visit dates) so the honest stats on
  the customer profile/dashboard reflect what was actually in the file.
- **Error report**: any row that didn't make it in (duplicates aside) can be
  downloaded afterward as a CSV of `Name, Phone, Reason`.

**Not built in Phase 5** (by design): the opportunity engine, customer
scoring, AI, WhatsApp, campaigns, scheduling, payments, POS/billing
integrations. Importing customer data does not trigger any "who should I
contact" logic — that's a later phase.

## Deploying to Vercel

1. Push this repo to GitHub (or any Git provider Vercel supports).
2. Import it in Vercel as a Next.js project — no custom build settings needed.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under
   Project Settings → Environment Variables if you have a Supabase project
   ready; otherwise deploy without them — the app runs fine and `/settings`
   will just show "Not configured".
4. Deploy. `npm run build` is what Vercel runs; see "Known issues" below for
   the one thing to watch for in restrictive network environments.

## A note on how this was built

Phase 1 and Phase 2 were both built in a sandboxed environment with no access
to the npm registry, so new dependencies could be added to `package.json` but
not installed or type-checked end-to-end there. Every file was written by
hand and verified with `npx tsc --noEmit` — the whole project type-checks
cleanly except for the two files under `src/lib/supabase/` that import
`@supabase/ssr`, which only resolve once you run `npm install` yourself.
Please run `npm install && npm run build` locally as the first step.

## Known issues / things to watch for

- **`next/font/google` was removed.** It was originally used for the Inter
  typeface. Fetching a font from Google at build time is a real fragility —
  it's a network dependency at build time that has no place being required —
  so the app now uses the system font stack (`-apple-system`, `Segoe UI`,
  `Roboto`, etc. — see `tailwind.config.ts`), which looks nearly identical
  and has zero build-time network dependency. If you want Inter specifically,
  either self-host the font file with `next/font/local`, or re-add
  `next/font/google`.
- **Builds were verified with `npx tsc --noEmit`, not `next build`, from the
  sandbox this was developed in.** That sandbox bridges into a separate
  Linux VM to reach your files, which resolved a *different* `@next/swc-*`
  native binary than the one your own `npm install` fetched for your actual
  machine (e.g. `@next/swc-win32-x64-msvc` on Windows) — so a `next build`
  run from that bridge fails/hangs trying to fetch a Linux binary it doesn't
  have, which is a quirk of that bridge, not a bug in this code. `npx tsc
  --noEmit` doesn't need a native binary and passes cleanly. Your own
  `npm run build`, run directly on your machine, is the real signal — trust
  that over anything reported from an assistant's sandboxed test.
- `npm audit` reports a handful of vulnerabilities in dev-only tooling
  (old `eslint`/`glob`/`inflight` versions pulled in transitively). These
  don't affect the running app and are common in any fresh Next.js project;
  not something Phase 2 needed to chase down.

## Customer opportunity engine (Phase 6)

`/opportunities`, the dashboard, and each customer profile now surface
**real, deterministic** recommendations of who's worth contacting today —
computed live from `customers` and `customer_events`, with no AI/ML and
nothing persisted to the database.

- `src/lib/opportunities/` holds all the logic, kept separate from the UI:
  `constants.ts` (every tunable threshold), `types.ts`, `stats.ts` (turns a
  customer's events into a visit pattern — visit count, total spend, days
  since last visit, average return interval, favorite service),
  `rules.ts` (five priority-ordered rules), `scoring.ts` (an internal-only
  ranking score and a high/medium/low confidence rating — never shown to
  the business owner), `calculate.ts` (the entry points, wrapped so one bad
  record can't break the whole calculation), and a server-side
  `queries.ts` that reuses the same business-scoped, RLS-protected
  `listCustomers`/`listEventsForBusiness` queries as everything else.
- The five opportunity types, checked in this order per customer (first
  match wins — one opportunity per customer):
  1. **High-value customer gone quiet** — total spend at/above ₹5,000 and
     inactive 90+ days.
  2. **Due to return** — only once a customer has 3+ visits (enough to
     trust an average return interval) and is now 25%+ past it.
  3. **Service reminder** — 3+ visits for the same named service, and
     approaching (not yet overdue for) their usual interval for it.
  4. **Inactive** — catch-all for anyone quiet 90+ days that the above
     didn't already catch.
  5. **Follow-up** — intentionally a permanent no-op. The spec calls for
     flagging an unconverted enquiry, but `customer_events.event_type` only
     allows `visit | note | other` — there's no enquiry/lead event to
     detect a non-conversion from. Rather than invent logic the data can't
     support, this rule is a documented stub, ready for whenever enquiry
     tracking exists.
- Customers with zero logged visits are skipped entirely (never flagged as
  "inactive") — the UI instead shows an honest "not enough history yet"
  state, separate from "nothing stands out right now."
- `/opportunities` supports filtering by type and sorting by
  recommended/most overdue/highest value. Each opportunity has a detail
  page (`/opportunities/[customerId]`) with a "Continue" button that's
  intentionally disabled — sending anything (WhatsApp, SMS) is later-phase
  work.

## AI message generation (Phase 7)

On the opportunity detail page (`/opportunities/[customerId]`), reached from
the dashboard, `/opportunities`, or a customer's profile, the owner can now
have Accelio draft the actual message — on request only, never automatically.

- Accelio (Phase 6) still decides **who** to contact and **why**; the AI
  (OpenAI, `gpt-4o-mini`) only decides **how** to phrase it. The AI never
  determines whether a customer is overdue — it's handed the engine's own
  reason text and asked to phrase a message around it.
- `src/lib/ai/` holds all AI logic, kept separate from the UI: `types.ts`,
  `prompts.ts` (system + user prompt construction), and
  `generate-message.ts` (the one place that actually calls OpenAI, via a
  plain server-side `fetch` — no client code ever sees `OPENAI_API_KEY`).
  `POST /api/ai/generate-message` (`src/app/api/ai/generate-message/route.ts`)
  is the only entry point; it takes just `{ customerId, tone, language }`
  from the client and re-derives the business, customer, and opportunity
  context itself from the authenticated session — the client can never
  supply its own "reason" or pull another business's data.
- Supports 3 tones (Friendly, Professional, Warm; default Friendly) and 2
  languages (English, Hinglish — Roman script only). The generated message
  can be regenerated, edited in a plain textarea, and marked "ready" — no
  sending happens in this phase.
- The AI is told to never invent discounts, prices, appointments, services,
  or visit patterns that weren't explicitly given to it, never mention that
  the customer was "selected" or that AI wrote the message, and to treat
  every customer/business field as data — not as instructions — even if a
  name or note contains something that reads like a command.
- Missing API key, OpenAI errors, timeouts, and malformed responses all show
  a plain "we couldn't generate a message" instead of crashing or leaking
  internal errors. Without `OPENAI_API_KEY` set, the rest of the app is
  completely unaffected — only "Generate message" shows a configuration
  message.

## Real WhatsApp sending (Phase 8)

Once a business connects WhatsApp (Settings -> WhatsApp Business) and a
message is generated and reviewed, the owner can send it for real through
the official Meta WhatsApp Cloud API — never automatically.

- `src/lib/whatsapp/` holds all the logic: `config.ts` (server-only env
  access), `types.ts`, `phone.ts` (conservative Indian mobile number
  normalization — returns null rather than guessing), `client.ts` (the one
  place that calls `graph.facebook.com`), `send.ts` (decides template vs.
  free-form), `queries.ts`, and `actions.ts` (the Settings connect/disconnect
  server actions). `POST /api/whatsapp/send`
  (`src/app/api/whatsapp/send/route.ts`) is the only endpoint that can
  actually send — it re-derives the business, customer, WhatsApp connection,
  and phone number server-side from the session, the same "never trust the
  client" rule Phase 7's AI endpoint follows.
- A real `messages` table (Supabase migration `0003_phase8_whatsapp_and_messages.sql`)
  persists every send attempt (`draft` -> `sending` -> `sent`/`failed`),
  with RLS scoping it to the owning business exactly like every other
  table. A `whatsapp_connections` table holds each business's own
  `phone_number_id`/`business_account_id` — see that migration's comment
  for why the Meta access token itself stays in the server environment
  (`WHATSAPP_ACCESS_TOKEN`) rather than the database for this MVP.
- Sending only happens after an explicit "Send message" confirmation
  (with a preview and the destination number shown first) — never on
  opportunity load, message generation, page load, or refresh. A 30-second
  duplicate-send guard plus a disabled button while sending prevent a
  double-click or retry from sending the same message twice.
- `/api/webhooks/whatsapp` receives Meta's delivery status callbacks
  (GET for the verification handshake using `WHATSAPP_VERIFY_TOKEN`, POST
  for status events, signature-verified via `WHATSAPP_APP_SECRET`, mandatory in production)
  and updates a message's `sent`/`delivered`/`read`/`failed` status by its
  `provider_message_id`. See "WhatsApp message tracking + replies
  (Phase 9)" below for the full delivery lifecycle and inbound replies.
- Without `WHATSAPP_ACCESS_TOKEN` configured, or before a business connects
  a number, the rest of the app is unaffected — Settings shows "not
  connected," and the send button is replaced with "Connect WhatsApp to
  send this message."

## WhatsApp message tracking + replies (Phase 9)

Once a message is sent, Accelio now tracks what actually happens to it —
delivered, read, failed — and records when the customer replies, all from
real Meta webhook events. This does NOT turn Accelio into a WhatsApp chatbot:
there are no automatic replies, no automated follow-ups, and no bulk
sending. The owner approves every outbound message (Phase 8) and continues
any conversation manually on WhatsApp itself.

- **Message status lifecycle**: `draft` -> `sending` -> `sent` -> `delivered`
  -> `read`, with `failed` as a separate terminal state. Status only ever
  moves forward (`src/lib/whatsapp/webhooks/status.ts`) — a stale or
  out-of-order webhook event can never downgrade `read` back to
  `delivered`, or overwrite an already-delivered/read message as `failed`.
  New nullable timestamp columns (`delivered_at`, `read_at`, `failed_at`)
  on `messages` record exactly when each state was reached (Supabase
  migration `0005_phase9_message_tracking.sql`). The existing `error_message`
  column (Phase 8) is reused as the sanitized failure reason — no
  duplicate column was added for it.
- **Webhook idempotency**: Meta retries webhook deliveries, so every write
  is safe to receive twice. A `message_events` table logs every status/
  inbound event Meta sends, with a unique index on
  `(provider_message_id, event_type)` — a duplicate delivery hits that
  constraint and is silently ignored rather than double-processed. This
  table is for debugging only: raw webhook payloads are never shown in the
  owner-facing UI, and it's RLS-protected (read-only, scoped to the owning
  business — every write comes from the webhook's service-role client).
- **Customer replies**: a `customer_messages` table stores inbound WhatsApp
  messages, matched to a customer by normalizing the sender's WhatsApp
  number with the same `normalizePhoneForWhatsApp` logic used for sending
  (`src/lib/whatsapp/phone.ts`) — never by creating a duplicate customer
  for a differently-formatted number. Outbound and inbound messages
  deliberately stay in two separate tables (see that migration's comment)
  and are merged into one time-ordered conversation only at query time
  (`getCommunicationTimelineForCustomer` in `src/lib/whatsapp/queries.ts`).
- **Unknown senders**: an inbound message from a number that doesn't match
  any customer is stored with `customer_id = null` and surfaced on the
  Activity page under "Unknown WhatsApp senders" — Accelio never guesses or
  silently creates a customer from WhatsApp traffic. The owner can
  explicitly click "Add as customer" (`src/lib/whatsapp/actions.ts`'s
  `addCustomerFromUnknownSender`) to create the customer and attach that
  message (and any others from the same number) to it.
- **Customer profile**: "Communication history" now shows the full merged
  conversation — outbound messages with Sent/Delivered/Read/Failed status,
  and inbound replies — plus a "Customer replied" badge and a "Reply on
  WhatsApp" link (a `wa.me/<number>` deep link; Accelio never sends anything
  automatically through it, it just opens WhatsApp for the owner to
  continue the conversation by hand).
- **Activity page**: now real data instead of mock — lightweight counters
  (Sent / Delivered / Read / Replies / Failed) computed from the real
  `messages` and `customer_messages` tables, plus a merged recent-activity
  feed and the unknown-senders list described above.
- **Business isolation**: every webhook-driven write derives its
  `business_id` only from data the sender can't control — a status
  event's `provider_message_id` is looked up against `messages` (which
  already belongs to a specific business), and an inbound message's
  business comes from the receiving `phone_number_id` via
  `whatsapp_connections`. RLS (`0005_phase9_message_tracking.sql`) enforces
  the same boundary independently on both new tables.
- **Webhook configuration required from you** (see `.env.example`):
  `WHATSAPP_VERIFY_TOKEN` (any string you choose, entered again in Meta's
  App Dashboard -> WhatsApp -> Configuration -> Webhook) and
  `WHATSAPP_APP_SECRET` (required in production — when `NODE_ENV=production`
  and it is unset, the webhook refuses every request; in local development
  it may be left empty and unsigned requests are accepted with a warning). Meta's webhook
  needs a public HTTPS URL; for local development, tunnel your dev server
  (e.g. with `ngrok http 3000`) and register
  `https://<your-tunnel>/api/webhooks/whatsapp` as the callback URL,
  subscribed to the `messages` field.
- **Not implemented in Phase 9** (by design — see the Phase 9 spec): AI
  auto-replies or chatbot behavior, automatic follow-ups, bulk/campaign
  sending, and full WhatsApp template management. AI message generation
  (Phase 7) remains owner-initiated only.
- **Verification note**: webhook processing, status transitions, and
  idempotency were verified directly against the database (simulating
  Meta's exact update/insert patterns, including duplicate-event and
  out-of-order scenarios) since this environment has no way to receive a
  live callback from Meta's servers. Live delivery/read/reply events from
  a real Meta WhatsApp Business Account have not been observed end-to-end
  — that requires your own Meta app, webhook URL, and test conversation.

## Analytics, campaign performance & customer reactivation (Phase 11)

`/analytics` answers one question: **is Accelio actually helping bring
customers back?** Every number on it — and the lightweight summary on the
main dashboard — comes from existing `messages`, `customer_messages`,
`customer_events`, `campaigns`, and `campaign_recipients` rows (Phases
4/8/9/10). Phase 11 added **no new tables**, only a handful of indexes
(`supabase/migrations/0007_phase11_analytics_indexes.sql`) and a new
`src/lib/analytics/` module that aggregates what already exists.

### Metric definitions

- **Messages Sent** — messages with status `sent`, `delivered`, or `read`
  (i.e. actually accepted by the WhatsApp send flow — a `draft` that was
  never sent, or one that outright `failed`, is not "sent").
- **Delivered** / **Read** — messages whose status is `delivered`/`read`
  (using the status column, not just the `delivered_at`/`read_at`
  timestamp columns, since Meta can report "read" without a separate
  "delivered" webhook ever arriving).
- **Customers Contacted** — the number of *unique customers* who received
  at least one qualifying message in the period. If one customer receives
  3 messages, Customers Contacted = 1 and Messages Sent = 3 — these are
  deliberately different numbers, never conflated.
- **Replies** — inbound rows in `customer_messages` (Phase 9). "Total
  Replies" and "Customers Who Replied" are shown separately — five replies
  from one customer is 1 customer, not 5.
- **Delivery Rate** = delivered ÷ sent. **Read Rate** = read ÷ delivered.
  **Reply Rate** = unique customers who replied ÷ unique customers
  contacted. Any rate with a zero denominator displays `--`, never `0%` —
  a `0%` would falsely imply "we measured this and it failed."

### Customer reactivation ("Returned after outreach")

This is the central, and most carefully specified, metric. Defined in
`src/lib/analytics/reactivation.ts`:

- **`REACTIVATION_ATTRIBUTION_DAYS = 30`** — a customer is "returned after
  outreach" if they recorded a qualifying visit (`customer_events` with
  `event_type = 'visit'`) within 30 days of a qualifying outbound message,
  and the visit happened *after* the message (a visit before the message
  is never attributed to it).
- **Attribution rule**: a customer is credited to the **most recent**
  qualifying outreach before their return visit (not their first message)
  — a customer messaged 3 times who then visits is still counted once,
  attributed to whichever of those 3 messages is closest to the visit.
- **Revenue rule**: only the customer's **first** qualifying return visit
  counts toward "Revenue from customers who returned after outreach" — a
  second, third, etc. visit afterwards is real repeat business, but
  attributing all of it to the original message would overstate Accelio's
  effect, so the metric stays conservative on purpose.
- The 30-day boundary is inclusive (exactly 30.0 days still counts; 30
  days + 1ms does not) and computed on real UTC timestamps, never
  client-side local-date math, to avoid the off-by-one errors date-based
  logic is prone to.

**This is an observational metric, not proof of causation.** The UI, this
README, and the code comments only ever say "returned after outreach" /
"customers who returned after outreach" — never "Accelio generated this
customer," "Accelio caused this sale," or any invented ROI/percentage
uplift. If visit amounts (`customer_events.amount`) were never recorded
for a business, the revenue tile shows **"Revenue tracking unavailable"**
— never a fabricated ₹0, which would incorrectly imply zero revenue
rather than "we don't know."

### Date filtering

Last 7 / 30 / 90 days, or a custom range, resolved in
`src/lib/analytics/date-range.ts`. All boundaries are UTC calendar days
with an **exclusive** upper bound everywhere (start ≤ t < end) — using one
consistent rule instead of mixing inclusive/exclusive logic is what avoids
the classic off-by-one on day/month boundaries. **Known limitation**: the
app doesn't yet store a per-business timezone (only `city`, which isn't a
reliable timezone source), so "last 7 days" currently means UTC calendar
days, not the business owner's local calendar days — for an India-based
business this can shift the reported boundary by up to 5.5 hours. Adding a
real per-business timezone field is a natural follow-up, not done here to
avoid scope creep beyond what Phase 11 asked for.

### Campaign & opportunity analytics

`/campaigns` and `/analytics`'s campaign table both show real, per-campaign
Recipients / Sent / Delivered / Read / Replies / Returned numbers
(`src/lib/analytics/campaigns.ts`) — reusing Phase 10's `campaign_recipients`
rows and Phase 9's status/reply tracking, never a second counting system.
A campaign's "Returned" count only considers that campaign's own linked
messages as qualifying outreach (not a customer's other messages), so a
campaign's numbers reflect what that campaign itself did.

`/analytics`'s opportunity-performance table (`src/lib/analytics/opportunities.ts`)
shows plain Contacted / Replies / Returned counts per opportunity type
(due to return, inactive, high-value inactive, service reminder,
follow-up) — deliberately never labeled "best" or "winner," just facts.

### Architecture

```
src/lib/analytics/
  date-range.ts          date filter resolution (7d/30d/90d/custom, UTC)
  rates.ts                pure rate math (delivery/read/reply rate, "--" on zero denominator)
  reactivation.ts          pure attribution logic + REACTIVATION_ATTRIBUTION_DAYS (no Supabase import — unit tested standalone)
  reactivation-query.ts    Supabase wrapper: full-history reactivation per business
  messages.ts               sent/delivered/read/replies + rates for a business
  campaigns.ts               per-campaign analytics
  opportunities.ts           per-opportunity-type analytics
  customers.ts                per-customer summary + "recently returned" list
  dashboard.ts                lightweight fixed-30-day dashboard summary
  overview.ts                  total customers + message/reactivation summary for /analytics
  trends.ts                     time-series buckets (day/week) for the Trends section
```

Every query is server-side (Server Components / server-only modules —
none of this ships to the browser), scoped with `.eq("business_id", ...)`
using a `businessId` that always comes from `requireBusinessForCurrentUser()`
/ `getBusinessForCurrentUser()` (the authenticated session), never from a
client-supplied value — the same rule every other phase in this app
follows. No new RLS policies were needed since Phase 11 introduces no new
tables; the existing per-business RLS on `messages`, `customer_messages`,
`customer_events`, `campaigns`, and `campaign_recipients` already covers
everything this phase reads.

### Testing

Every pure-logic test lives in `scripts/*-tests.ts`. Run them all with:

```
npm test
```

`scripts/run-tests.js` compiles them once (`tsconfig.tests.json`) and runs
each file under four process time zones — UTC, Asia/Kolkata,
America/New_York and Pacific/Kiritimati — because business date logic must
use the business's own time zone, never the server's. A file that passes
in one zone but not another fails the run.

The older per-file commands (`tsconfig.automations-test.json` etc.) still
work but are no longer needed.

Database-level behavior (real Supabase queries, RLS, the reactivation
query against live data) was verified directly against this project's
Supabase instance rather than through a mocked test suite — see the Phase
11 chat report for exactly what was run.

## What's mocked vs. real

Real (once you've added Supabase credentials and run the Phase 4 migration):
- Authentication: signup, login, logout, session persistence, protected
  routes, forgot/reset password, email confirmation
- Business profile (Settings) — real read/write against the `businesses` table
- Customer list, customer profile, full customer CRUD, and "Add activity"
  (customer visit history) — all against real, per-business `customers` /
  `customer_events` tables with database-enforced tenant isolation
- Dashboard, `/opportunities`, and the customer-profile recommendation card
  — real, deterministic, rule-based opportunities computed live from real
  visit history (see "Customer opportunity engine" above)
- AI-generated message drafting on the opportunity detail page (requires
  `OPENAI_API_KEY`; see "AI message generation" above)
- Sending that message on WhatsApp (requires WhatsApp to be configured and
  connected; see "Real WhatsApp sending" above), and the customer profile's
  full communication history — real, persisted `messages` (outbound) and
  `customer_messages` (inbound) records, including delivered/read status
  and customer replies (see "WhatsApp message tracking + replies" above)

Also real (Phase 10 and 11):
- Campaign creation, review, approval, and sending (`/campaigns`,
  `/campaigns/[id]`) against real `campaigns` / `campaign_recipients`
  tables — reusing the same opportunity engine, AI generation, and
  WhatsApp send/tracking infrastructure as the per-customer flow (see
  "Simple campaigns & follow-ups" — note: this section predates a formal
  README write-up from Phase 10 itself, so see the Phase 10 chat report
  for full detail)
- `/analytics` — real, database-derived engagement and reactivation
  metrics (see "Analytics, campaign performance & customer reactivation"
  below)

Still mocked / not built (by design, later phases):
- SMS and payments integrations
- AI auto-replies, chatbots, or any automated conversation handling —
  replying to a customer is always a manual action on WhatsApp itself
- Recurring/scheduled campaigns, A/B testing, churn/CLV prediction, or any
  other analytics beyond what's described in the Phase 11 section below

Real, independent of Supabase (client-side, no backend needed):
- Navigation between all routes
- "Send WhatsApp" button (Sending... → Sent ✓ animation, nothing is sent)
- Message editing on a customer profile (local state only, mock mode)
- CSV/Excel parsing, column mapping, validation, and duplicate detection in
  the import wizard (only the final, reviewed rows touch the server)
