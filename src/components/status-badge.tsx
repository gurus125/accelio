import { Badge } from "@/components/ui/badge";
import type { DerivedCustomerStatus } from "@/lib/customers/status";

const CONFIG: Record<DerivedCustomerStatus, { label: string; variant: "success" | "warning" | "danger" | "default" | "muted" }> = {
  active: { label: "Active", variant: "success" },
  due: { label: "Due to return", variant: "warning" },
  inactive: { label: "Inactive", variant: "danger" },
  follow_up: { label: "Follow up", variant: "default" },
  new: { label: "No visits yet", variant: "muted" },
};

export function StatusBadge({ status }: { status: DerivedCustomerStatus }) {
  const config = CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
