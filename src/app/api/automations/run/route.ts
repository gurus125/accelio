import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSchedulerTick } from "@/lib/automations/scheduler";

/** Phase 19 hardening — a plain `!==` string comparison on a secret token
 * leaks timing information proportional to how many leading characters
 * match, which is the textbook setup for a timing attack. Low real-world
 * risk here (this token isn't attacker-observable at sub-millisecond
 * precision over a real network), but there's no reason not to compare it
 * the same constant-time way the WhatsApp/Razorpay webhook signatures
 * already are. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export const dynamic = "force-dynamic";

/**
 * POST /api/automations/run — the ONLY way the automation scheduler ever
 * executes. Never reachable by a browser or a customer-facing request:
 * protected by a shared-secret bearer token (`CRON_SECRET`), the same
 * convention Vercel Cron itself uses for injecting an Authorization header
 * into scheduled requests (see vercel.json).
 *
 * FAILS CLOSED (spec step 50): if `CRON_SECRET` isn't set at all, this
 * route refuses every request — automated sending simply never happens
 * until an owner deliberately configures it, rather than silently running
 * unprotected. There is no public, unauthenticated path to trigger an
 * automated WhatsApp send anywhere in this codebase.
 */
export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "Automations aren't configured yet: CRON_SECRET is not set." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!timingSafeStringEqual(authHeader, `Bearer ${configuredSecret}`)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const results = await runSchedulerTick(supabase);
    const summary = {
      automationsRun: results.length,
      sent: results.reduce((n, r) => n + r.outcomes.filter((o) => o.status === "sent").length, 0),
      skipped: results.reduce((n, r) => n + r.outcomes.filter((o) => o.status === "skipped").length, 0),
      failed: results.reduce((n, r) => n + r.outcomes.filter((o) => o.status === "failed").length, 0),
      errors: results.filter((r) => r.error).map((r) => ({ automationId: r.automationId, error: r.error })),
    };
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown scheduler error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET is allowed too, purely so a self-hosted cron tool that only
 * supports GET requests (e.g. some free cron-ping services) can still
 * trigger a tick — same auth requirement, same handler. */
export async function GET(request: Request) {
  return POST(request);
}
