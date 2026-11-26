import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { getPublicWidgetConfig } from "@/lib/leads/capture";

export const dynamic = "force-dynamic";

/**
 * GET /api/widget/[key] — public, unauthenticated. Returns only the
 * handful of display fields `public/reelo-widget.js` needs to render a
 * business's lead form (button text, consent copy, interest options,
 * accent color, business name). Never the business's other data, never
 * the widget's internal id, never anything that would let one widget_key
 * be used to enumerate or affect another business.
 */
export async function GET(_request: Request, { params }: { params: { key: string } }) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ ok: false, error: "This feature isn't available yet." }, { status: 503 });
    }

    const config = await getPublicWidgetConfig(params.key);
    if (!config) {
      return NextResponse.json({ ok: false, error: "This form is no longer available." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        businessName: config.businessName,
        buttonText: config.widget.button_text,
        introText: config.widget.intro_text,
        consentText: config.widget.consent_text,
        defaultSource: config.widget.default_source,
        interestOptions: config.widget.interest_options,
        accentColor: config.widget.accent_color,
      },
    });
  } catch (error) {
    console.error("[api/widget] Unexpected error.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "This form is no longer available." }, { status: 500 });
  }
}
