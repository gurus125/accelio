import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = "upload" | "map" | "review" | "importing" | "done";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map" },
  { id: "review", label: "Review" },
  { id: "importing", label: "Import" },
];

export function ImportStepper({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current || (current === "done" && s.id === "importing"));

  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIndex;
        const isActive = idx === currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isDone
                    ? "bg-success-500 text-white"
                    : isActive
                    ? "bg-brand-500 text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && <span className="h-px w-4 bg-border sm:w-8" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
