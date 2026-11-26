import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one "this is a real screen from the Reelo app" wrapper, reused by
 * every product showcase on the homepage (hero, recommendations, WhatsApp
 * outreach, analytics) so they read as one consistent product, not four
 * differently-styled mockups. A slim title bar (dot chrome + a label,
 * never real browser controls) is enough to signal "app UI" without
 * looking like a screenshot of someone else's browser.
 */
export function ProductFrame({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-white shadow-xl transition-transform duration-300 hover:-translate-y-1", className)}>
      {label && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success-500/70" />
          <span className="ml-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {label}
          </span>
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}
