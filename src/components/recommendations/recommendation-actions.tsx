"use client";

import * as React from "react";
import { Sparkles, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageGenerator } from "@/components/ai/message-generator";

interface RecommendationActionsProps {
  customerId: string;
  customerName: string;
  opportunityType: string;
  whatsappConnected: boolean;
  customerPhoneDisplay: string | null;
}

/**
 * The dashboard recommendation card's only action. Deliberately a thin
 * expand/collapse wrapper around the EXACT SAME `MessageGenerator` used on
 * the opportunity detail page (Phase 7/8) — no second AI call, no second
 * WhatsApp send path. Collapsed by default so ten recommendation cards on
 * one dashboard don't all show tone/language pickers at once (Phase 12
 * spec section 20: keep it simple, not "another dashboard").
 */
export function RecommendationActions(props: RecommendationActionsProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (!expanded) {
    return (
      <Button size="sm" onClick={() => setExpanded(true)}>
        <Sparkles className="h-3.5 w-3.5" />
        Generate message
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <MessageGenerator
        customerId={props.customerId}
        customerName={props.customerName}
        opportunityType={props.opportunityType}
        whatsappConnected={props.whatsappConnected}
        customerPhoneDisplay={props.customerPhoneDisplay}
      />
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        Collapse
      </button>
    </div>
  );
}
