import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getCampaign } from "@/lib/campaigns/queries";
import { sendCampaignMessages } from "@/lib/campaigns/send";

export const dynamic = "force-dynamic";
// Sending a campaign to many recipients can take a while (batched, real
// Meta API calls) — allow more time than the framework default rather
// than the request being cut off mid-send.
export const maxDuration = 120;

/**
 * POST /api/campaigns/[id]/send
 *
 * The ONLY path that sends a campaign's messages — always in direct
 * response to an explicit "Send campaign" confirmation click (see the
 * campaign detail page). Re-derives the business and campaign server-side
 * from the session; never trusts a client-supplied business_id. See
 * `lib/campaigns/send.ts` for the actual per-recipient dispatch, which
 * reuses Phase 8/9 infrastructure rather than inventing a new one.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ ok: false, error: "This feature isn't available yet." }, { status: 503 });
    }

    const business = await getBusinessForCurrentUser();
    if (!business) {
      return NextResponse.json({ ok: false, error: "Set up your business profile first." }, { status: 403 });
    }

    const campaign = await getCampaign(business.id, params.id);
    if (!campaign) {
      return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    }
    if (campaign.status !== "approved") {
      return NextResponse.json({ ok: false, error: "This campaign needs to be approved before sending." }, { status: 400 });
    }

    const result = await sendCampaignMessages(business, campaign);
    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/campaigns/send] Unexpected error.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "The campaign couldn't be sent. Please try again." }, { status: 500 });
  }
}
