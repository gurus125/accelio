# Accelio — instructions for Claude Code

Read this whole file before doing any work. It records decisions the founder has already made.

## Product (decided)

Accelio is a **free billing counter for salons and beauty parlours that brings customers back on WhatsApp and proves the money it recovered.**

- Target: independent men's/unisex salons and shop-based beauty parlours in India, 2–6 staff, a few hundred regulars, currently using a paper register. NOT chains, NOT restaurants, NOT other segments yet.
- The codebase is still named "Reelo" — rename all user-facing text to "Accelio" (Reelo is an unrelated competitor).
- Core loop: staff bill the customer in Accelio (phone-number first) → visit is logged → Accelio learns each customer's return cycle per service → due customers get a WhatsApp reminder → return visits are measured against a hold-back group → owner sees ₹ recovered.
- Plans: Free (billing counter, WhatsApp bills, day-end report) · ₹499/month (reminders, daily owner WhatsApp digest, money-back report) · ₹999/month (reviews, referrals, birthdays, packages, season campaigns, staff accounts). WhatsApp message costs are passed through.

## Out of scope — do not build

GST tax invoices, inventory, payroll, appointment calendar, multi-branch, customer-facing app, marketplace, cross-business loyalty, AI chatbots/auto-replies, new business segments. Leave existing leads widget, Razorpay billing and team code in place but do not extend them unless a milestone says so.

## Stack and engineering rules

- Next.js 14 App Router + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS). Deployed on Vercel. Keep this stack; no rewrites.
- Every schema change = a NEW file in `supabase/migrations/` (next number in sequence), idempotent (`if not exists`, `create or replace`, `drop policy if exists` + `create policy`). Never edit old migrations.
- Every new business-owned table: `business_id` column, RLS enabled, policies using `public.is_business_member(business_id)` / `public.is_business_owner(business_id)`, indexes on `business_id` and common filters.
- Never commit secrets. `.env.local` is gitignored; add any new variable to `.env.example` with an empty value and document it in README.
- Store timestamps in UTC; all business logic that depends on "today", hours or dates must use the business timezone (default `Asia/Kolkata`), never the server's local time.
- Phones: always normalise to `+91XXXXXXXXXX` (10-digit Indian mobile) before saving or matching — manual entry, import, billing and WhatsApp webhooks must use one shared function.
- Queries that can exceed 1,000 rows must paginate or aggregate in SQL (Supabase API caps responses at 1,000 rows).
- UI must work fast on a cheap Android phone: large tap targets, mobile-first, Hindi/English labels where shown to staff.
- Pure logic goes in `src/lib/**` without Supabase imports so it can be unit-tested. Add tests for new logic (existing pattern in `scripts/*-tests.ts`; adding `vitest` is allowed).
- You cannot reach the live Supabase project, WhatsApp or OpenAI from the cloud. Do NOT try to apply migrations or call live services. List migrations the founder must apply in each PR.

## Workflow for every milestone

1. Create a branch `milestone-N-short-name` from `main`.
2. Commit in small, clearly described steps.
3. Before opening the PR run: `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and all test scripts. All must pass.
4. Open a PR (do not merge) with: what changed, migrations to apply (in order), new env variables, how to test manually, and anything you could not verify.
5. Update the checklist in this file (tick done items) in the same PR.

## Known bugs from the audit (13 Nov 2026)

1. New signups get stuck: nothing inserts the owner's `business_members` row, but all RLS/queries require it.
2. WhatsApp: no template configured → app sends free-form text, which WhatsApp only allows within 24h of the customer's last message. Only one template with 2 variables is supported.
3. `whatsapp_connections.phone_number_id` is not unique across businesses (one business could send as another; inbound replies could be misrouted).
4. Import saves history as `event_type = 'other'`; the opportunity engine only counts `'visit'`, so imported customers are never flagged.
5. No consent / opt-out for customers (only leads). No STOP handling on inbound messages.
6. Manual customer entry stores phone as typed; import stores `+91…` → duplicates.
7. `listCustomers` / `listEventsForBusiness` and analytics load all rows without pagination (1,000-row cap).
8. `customers.status` is a manual dropdown, separate from the computed engine.
9. Date logic uses server local time (`recurring-schedules`, `automations/safety.ts` "today"); 2 recommendation tests fail outside UTC.
10. `WHATSAPP_APP_SECRET` optional → webhook accepts unsigned requests; make it required in production.
11. Both `next.config.js` (ESM syntax in .js) and `next.config.mjs` exist — keep one.
12. Vercel cron runs every 10 minutes; Hobby plan only allows daily crons — document and make the scheduler work with an external cron too.

## Milestones (do them in order, one PR each)

### Milestone 1 — Pilot blockers
- [x] Owner membership: migration with trigger on `businesses` insert creating the owner `business_members` row + backfill for existing businesses without one.
- [x] Shared phone normaliser used everywhere; migration to normalise existing phones and a report (not auto-merge) of duplicates.
- [x] Import creates a real `visit` event for the last visit date (with service if provided); keep summary note.
- [x] Customer consent fields (`whatsapp_consent`, `consent_source`, `consent_at`, `opted_out_at`); inbound STOP/UNSUBSCRIBE sets opt-out; all sends and automations skip opted-out / non-consented customers.
- [x] Unique `phone_number_id` across active connections.
- [x] Pagination / SQL aggregation for customer, event and analytics queries.
- [x] Business-timezone date helpers; fix recurring schedules and daily caps; all tests pass in any TZ.
- [x] Customer status derived from the engine (remove manual dropdown or make it a separate "tag").
- [x] Webhook signature required when `NODE_ENV=production`; single next.config; rename Reelo → Accelio in UI.

### Milestone 2 — WhatsApp templates done properly
- [ ] `message_templates` table (name, category: marketing/utility, language, body with variables, status) seeded with: return reminder, offer, feedback/review request, WhatsApp bill, owner daily digest.
- [ ] Send logic: free-form only inside the 24h customer service window, otherwise an approved template with mapped variables. AI drafts may only fill template variables.
- [ ] Parlour "discreet" mode: reminders never name the service.
- [ ] Hindi, English and Hinglish versions.

### Milestone 3 — Billing counter (the core new feature)
- [ ] Business type (salon / parlour / unisex) with preset service price lists and default return days (e.g. haircut 28, beard 10, colour 45, threading 18, waxing 25, facial 30); owner can edit.
- [ ] Billing screen: phone search (match after 4 digits, or name) → existing customer card (last visit, usual services, wallet, stamps, preferred staff, notes) → one-tap usual services; new customer needs only name (+ gender for parlour/unisex); "Guest" bill without a number.
- [ ] Bill: line items, staff per item, discount, payment mode (cash/UPI/card), total. Tables `bills`, `bill_items`. Each saved bill creates the visit event(s) used by the engine.
- [ ] Day-end report: total sales, cash vs UPI vs card, sales per staff, top services, new vs returning customers.
- [ ] Target: repeat-customer bill in ~10 seconds, new customer ~20 seconds.

### Milestone 4 — Customer benefits
- [ ] WhatsApp bill (utility template) after each bill, with a "Get reminders and offers? Yes/No" button that records consent.
- [ ] Wallet cashback (owner sets ₹ per visit and expiry days) applied at billing; expiry reminder.
- [ ] Stamp card (owner sets "Nth visit free/discount"); progress shown on the WhatsApp bill.
- [ ] Customer notes / service history (e.g. colour shade) on the customer card.

### Milestone 5 — Owner on WhatsApp
- [ ] Daily morning digest to the owner's number: customers due today and estimated ₹; reply/button to approve sending reminders.
- [ ] Evening summary: visits today, customers who returned after reminders, ₹.
- [ ] "Fill my slow day" action: pick a day, offer to due customers.

### Milestone 6 — Proof of money
- [ ] Hold-back group: a configurable share (default 20%) of due customers is randomly NOT messaged and recorded.
- [ ] Money-back report: return rate messaged vs held back, customers returned, ₹ recovered (labelled "estimated").
- [ ] Free "₹ you're losing" check from an imported customer list.

### Later (do not start without founder approval)
Register photo import (AI vision), Google review requests, referrals, birthdays, packages, season campaigns, booking link, billing-software integrations.
