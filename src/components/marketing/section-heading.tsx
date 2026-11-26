import { cn } from "@/lib/utils";

/**
 * The one heading pattern reused across every marketing section: a small
 * eyebrow (optional), a heading, and an optional supporting line —
 * centered by default since that's how most sections in the spec read,
 * but left-alignable for the few that sit next to a visual.
 */
export function SectionHeading({
  eyebrow,
  heading,
  subheading,
  align = "center",
  className,
}: {
  eyebrow?: string;
  heading: React.ReactNode;
  subheading?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className
      )}
    >
      {eyebrow && (
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{heading}</h2>
      {subheading && <p className="mt-3 text-lg text-muted-foreground">{subheading}</p>}
    </div>
  );
}
