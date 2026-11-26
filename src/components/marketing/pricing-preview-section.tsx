import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_ORDER, PLANS, formatPlanPrice } from "@/lib/billing/plans";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

/**
 * A summary of the real pricing page — not a second source of truth. Every
 * price and limit here comes straight from `lib/billing/plans.ts`, the
 * same place `/pricing` itself reads from, so this preview can never drift
 * from what the backend actually enforces.
 */
export function PricingPreviewSection() {
  const plans = PLAN_ORDER.map((id) => PLANS[id]);

  return (
    <section className="border-b border-border/80">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Start free. Upgrade when you're ready."
          subheading="Reelo's Free plan is free forever. Upgrade when your business needs more capacity."
        />

        <Reveal className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFeatured = plan.id === "growth";
            const isFree = plan.id === "free";
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl",
                  isFeatured ? "border-brand-500 bg-brand-50/30 shadow-lg" : "border-border bg-white"
                )}
              >
                {isFeatured && (
                  <Badge variant="default" className="mb-3 w-fit">
                    Most popular
                  </Badge>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1">
                  {isFree ? (
                    <>
                      <span className="text-2xl font-semibold tracking-tight">₹0</span>
                      <span className="text-sm text-muted-foreground"> forever</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-semibold tracking-tight">{formatPlanPrice(plan)}</span>
                      <span className="text-sm text-muted-foreground"> / month</span>
                    </>
                  )}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {plan.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={buttonVariants({
                    size: "default",
                    variant: isFeatured ? "default" : "secondary",
                    className: "mt-6",
                  })}
                >
                  {isFree ? "Get started free" : "Get started"}
                </Link>
              </div>
            );
          })}
        </Reveal>

        <p className="mt-8 text-center">
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:underline">
            View full pricing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      </div>
    </section>
  );
}
