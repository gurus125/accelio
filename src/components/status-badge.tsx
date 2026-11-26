import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/types";

const CONFIG: Record<CustomerStatus, { label: string; variant: "success" | "warning" | "danger" | "default" }> = {
  active: { label: "Active", variant: "success" },
  due: { label: "Due to return", variant: "warning" },
  inactive: { label: "Inactive", variant: "danger" },
  follow_up: { label: "Follow up", variant: "default" },
};

export function StatusBadge({ status }: { status: CustomerStatus }) {
  const config = CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
