import { Badge } from "@/components/ui/badge";
import { describeLeadStatus } from "@/lib/leads/labels";
import type { LeadStatus } from "@/types/database";

const STATUS_TONE: Record<LeadStatus, "default" | "muted" | "success" | "warning" | "danger"> = {
  new: "warning",
  contacted: "default",
  replied: "success",
  qualified: "success",
  converted: "success",
  lost: "muted",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={STATUS_TONE[status]}>{describeLeadStatus(status)}</Badge>;
}
