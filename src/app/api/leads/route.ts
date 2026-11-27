import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { captureLead, type LeadCaptureInput } from "@/lib/leads/capture";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads — the ONLY public, unauthenticated write endpoint in
 * Accelio. A website visitor (not a signed-in Accelio user) posts here after
 * voluntarily filling in the embed widget's form. See `lib/leads/capture.ts`
 * for every trust decision this makes explicit, since it can't rely on RLS
 * the way authenticated routes do.
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ ok: false, error: "This feature isn't available yet." }, { status: 503 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    if (typeof rawBody !== "object" || rawBody === null) {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;

    const input: LeadCaptureInput = {
      widgetKey: body.widgetKey,
      name: body.name,
      phone: body.phone,
      email: body.email,
      interest: body.interest,
      message: body.message,
      source: body.source,
      sourceUrl: body.sourceUrl,
      consentGiven: body.consentGiven,
      website: body.website, // honeypot
    };

    const result = await captureLead(input);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    // Deliberately minimal response — never echoes back internal fields
    // (status, consent_text, business_id, etc.) to the public client.
    return NextResponse.json({ ok: true, deduped: result.deduped });
  } catch (error) {
    console.error("[api/leads] Unexpected error.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't submit this right now. Please try again." }, { status: 500 });
  }
}
