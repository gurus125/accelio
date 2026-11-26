import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone?: "brand" | "warning" | "danger" | "muted";
  onClick?: () => void;
  href?: string;
  className?: string;
}

const TONE_MAP = {
  brand: "bg-brand-50 text-brand-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
  muted: "bg-muted text-muted-foreground",
};

export function StatCard({ icon: Icon, value, label, tone = "brand", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-2xl border border-border bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card",
        className
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
          TONE_MAP[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none tracking-tight">{value}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
