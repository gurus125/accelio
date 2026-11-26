import Link from "next/link";
import { ArrowRight, PartyPopper } from "lucide-react";
import { RecommendationCard } from "./recommendation-card";
import type { DailyRecommendationsResult } from "@/lib/recommendations/types";

interface TodaysRecommendationsProps {
  result: DailyRecommendationsResult;
}

/**
 * The dashboard's primary action area (Phase 12 spec section 11/13/20):
 * "here's what you should do today," not another analytics widget. Always
 * rendered above the rest of the dashboard's stats/opportunity sections.
 */
export function TodaysRecommendations({ result }: TodaysRecommendationsProps) {
  const { recommendations, totalEligible } = result;

  if (recommendations.length === 0) {
    return (
      <div className="animate-fade-in-up rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <PartyPopper className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 font-medium">You&apos;re all caught up.</p>
        <p className="mt-1 text-sm text-muted-foreground">No customers need attention right now.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
          <Link href="/customers" className="font-medium text-brand-600 hover:underline">
            View customer list
          </Link>
          <Link href="/opportunities" className="font-medium text-brand-600 hover:underline">
            View opportunities
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today</h2>
          <p className="text-sm text-muted-foreground">
            {totalEligible} customer{totalEligible === 1 ? "" : "s"} need{totalEligible === 1 ? "s" : ""} your attention
            {recommendations.length < totalEligible ? ` — showing the top ${recommendations.length}` : ""}
          </p>
        </div>
        <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
          View all opportunities
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {recommendations.map((recommendation, index) => (
          <RecommendationCard key={recommendation.opportunity.id} recommendation={recommendation} index={index} />
        ))}
      </div>
    </div>
  );
}
