import { ArrowDown, ArrowRight, Database, Sparkles, TrendingDown } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: Database,
    title: "Customer data",
    description: "Customer information already exists in Excel, billing software, POS systems, or other sources.",
  },
  {
    icon: TrendingDown,
    title: "Missed opportunities",
    description: "Customers become due, inactive, or need follow-up — quietly, with no one keeping track.",
  },
  {
    icon: Sparkles,
    title: "Accelio",
    description: "Accelio identifies the customers worth contacting and tells the business why.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-b border-border/80">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Your customers are already there."
          subheading="Most local businesses already have hundreds or thousands of customers — but don't know who they should contact again."
        />
        <Reveal className="mx-auto mt-14 flex max-w-4xl flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-3">
          {STEPS.map((step, idx) => (
            <div key={step.title} className="flex flex-1 items-center gap-4 sm:flex-col sm:items-stretch sm:gap-0">
              <div className="group flex flex-1 flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/10">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 transition-transform duration-200 group-hover:scale-110">
                  <step.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              {idx < STEPS.length - 1 && (
                <>
                  <ArrowDown className="h-5 w-5 shrink-0 text-muted-foreground sm:hidden" />
                  <ArrowRight className="mx-2 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
                </>
              )}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
