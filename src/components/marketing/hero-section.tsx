import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatINR } from "@/lib/utils";
import { ProductFrame } from "./product-frame";
import { AnimatedCounter } from "./animated-counter";
import { HERO_SUMMARY, ANALYTICS_EXAMPLE } from "./example-data";

const TRUST_STATS = [
  { value: ANALYTICS_EXAMPLE.customersContacted, label: "Customers contacted" },
  { value: ANALYTICS_EXAMPLE.replies, label: "Replies" },
  { value: ANALYTICS_EXAMPLE.returnedAfterOutreach, label: "Customers returned" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border/80 bg-gradient-to-b from-brand-50/60 via-white to-white">
      {/* Decorative only: a soft dot-grid texture plus two slow-drifting
          color blobs. All aria-hidden, none of it shifts layout. */}
      <div className="bg-dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" aria-hidden="true" />
      <div className="glow-blob -left-24 -top-24 h-72 w-72 bg-brand-400" aria-hidden="true" />
      <div
        className="glow-blob -right-16 top-32 h-64 w-64 bg-violet-400"
        style={{ animationDelay: "-4s" }}
        aria-hidden="true"
      />

      <div className="container relative grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div className="animate-fade-in-up">
          <Badge variant="muted" className="mb-5">For local businesses</Badge>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Turn existing customers into{" "}
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-violet-500 bg-clip-text text-transparent">
              repeat customers.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Accelio finds the customers worth contacting, tells you why, helps you write the right message, and makes
            it easy to reach them.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className={buttonVariants({ size: "lg", className: "btn-shine shadow-lg shadow-brand-500/25" })}
            >
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how-it-works" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">No credit card needed. Set up in minutes.</p>

          {/* Illustrative outreach numbers — same example data used in the
              Analytics showcase section further down the page, not live
              figures. Purely a "this is what it looks like in motion"
              visual, counting up once when the hero scrolls into view. */}
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-border/70 pt-6">
            {TRUST_STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  <AnimatedCounter value={stat.value} />
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative animate-fade-in-up" style={{ animationDelay: "120ms" }}>
          <div className="glow-blob left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 bg-brand-300" aria-hidden="true" />
          <div className="relative">
            <ProductFrame label="Today's recommendations">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{HERO_SUMMARY.greeting} 👋</p>
                  <p className="text-base font-semibold">{HERO_SUMMARY.headline}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-md shadow-brand-500/30">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {HERO_SUMMARY.categories.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-border bg-muted/40 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white hover:shadow-md"
                  >
                    <p className="text-xl font-semibold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {HERO_SUMMARY.customers.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center gap-3 rounded-xl border border-border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-muted/40 hover:shadow-sm"
                  >
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.reason} · Last visit {c.daysAgo} days ago · {formatINR(c.spentRupees)}
                      </p>
                    </div>
                    <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-600">
                      Send
                    </span>
                  </div>
                ))}
              </div>
            </ProductFrame>
            <div className="absolute -right-4 -top-4 hidden rotate-3 animate-float rounded-xl border border-border bg-white px-3 py-2 shadow-lg sm:block">
              <p className="text-xs font-medium text-emerald-600">Sent ✓</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
