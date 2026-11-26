import { cn } from "@/lib/utils";

interface UsageBarProps {
  label: string;
  used: number;
  /** `null` = unlimited (renders as a plain count, no bar/percentage). */
  limit: number | null;
}

export function UsageBar({ label, used, limit }: UsageBarProps) {
  const percent = limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isNearLimit = limit !== null && percent >= 90;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", isNearLimit && "text-danger-600")}>
          {used.toLocaleString("en-IN")}
          {limit !== null ? ` / ${limit.toLocaleString("en-IN")}` : ""}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", isNearLimit ? "bg-danger-500" : "bg-brand-500")}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
