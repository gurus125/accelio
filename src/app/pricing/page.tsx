import Link from "next/link";
import { Sparkles, ArrowRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_ORDER, PLANS, formatPlanPrice } from "@/lib/billing/plans";
import { Reveal } from "@/components/marketing/reveal";

export const metadata = {
  title: "Pricing — Accelio",
  description: "Simple, transparent pricing for Accelio. Start on the Free plan — no card, no time limit — and upgrade whenever you need more.",
};

/**
 * The one public, unauthenticated billing page (deliberately left out of
 * `middleware.ts`'s `PROTECTED_PREFIXES`). Mirrors the marketing landing
 * page's own header/footer so the two feel like the same site, not a
 * bolted-on billing tool.
 *
 * Free is a permanent plan, not a trial — this page never uses the words
 * "trial", "demo", or a day count for it. Its card is designed to read as
 * a legitimate entry-level tier, the same visual weight as Starter and
 * Growth, not a lesser preview of them. Every number below comes straight
 * from `lib/billing/plans.ts` — nothing here is ever hand-typed separately
 * from what the backend actually enforces.
 */
export default function PricingPage() {
  const plans = PLAN_ORDER.map((id) => PLANS[id]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-white/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Accelio</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className={buttonVariants({ size: "sm" })}>
              Start for free
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-border/80 bg-gradient-to-b from-brand-50/40 to-white">
        <div className="container flex animate-fade-in-up flex-col items-center gap-4 py-16 text-center">
          <Badge variant="muted">Simple, transparent pricing</Badge>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Start free. Upgrade when you&apos;re ready.
          </h1>
          <p className="max-w-lg text-lg text-muted-foreground">
            Accelio&apos;s Free plan is free forever, no card required. Upgrade to Starter or Growth any time you need more
            room to grow.
          </p>
        </div>
      </section>

      <section className="container py-16">
        <Reveal>
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFeatured = plan.id === "growth";
            const isFree = plan.id === "free";
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-2xl border p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl",
                  isFeatured ? "border-brand-500 bg-brand-50/30 shadow-lg" : "border-border bg-white"
                )}
              >
                {isFeatured && (
                  <Badge variant="default" className="mb-4 w-fit">
                    Most popular
                  </Badge>
                )}
                {isFree && (
                  <Badge variant="muted" className="mb-4 w-fit">
                    No card required
                  </Badge>
                )}
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-6">
                  {isFree ? (
                    <>
                      <span className="text-4xl font-semibold tracking-tight">₹0</span>
                      <span className="text-sm text-muted-foreground"> forever</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-semibold tracking-tight">{formatPlanPrice(plan)}</span>
                      <span className="text-sm text-muted-foreground"> / month</span>
                    </>
                  )}
                </p>
                <Link
                  href="/signup"
                  className={buttonVariants({ size: "lg", variant: isFeatured ? "default" : "secondary", className: "mt-6" })}
                >
                  {isFree ? "Get started free" : "Get started"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <ul className="mt-8 space-y-3 text-sm">
                  {plan.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
                {isFree && (
                  <p className="mt-6 text-sm text-muted-foreground">
                    Use Accelio for free. Upgrade whenever you need more.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        </Reveal>

        <Reveal>
        <div className="mx-auto mt-16 max-w-4xl overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 text-left font-medium text-muted-foreground"></th>
                {plans.map((plan) => (
                  <th key={plan.id} className="px-4 py-3 text-left font-semibold">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Price</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3 font-medium">
                    {plan.id === "free" ? "₹0 forever" : `${formatPlanPrice(plan)}/month`}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Customers</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.limits.maxCustomers === null ? "Unlimited" : `Up to ${plan.limits.maxCustomers.toLocaleString("en-IN")}`}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Staff</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.limits.maxStaff}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">AI messages / month</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.limits.maxAiGenerationsPerMonth.toLocaleString("en-IN")}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">WhatsApp messages / month</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.limits.maxWhatsappMessagesPerMonth.toLocaleString("en-IN")}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Campaigns / month</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.limits.maxCampaignsPerMonth}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Active automations</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.limits.maxActiveAutomations}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        </Reveal>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/billing" className="font-medium text-foreground underline underline-offset-2">
            Manage your plan
          </Link>
          .
        </p>
      </section>

      <footer className="border-t border-border/80 py-8">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-white">
              <Sparkles className="h-3 w-3" />
            </div>
            <span className="font-medium text-foreground">Accelio</span>
          </div>
          <p>© 2026 Accelio. Made for local businesses.</p>
        </div>
      </footer>
    </div>
  );
}
