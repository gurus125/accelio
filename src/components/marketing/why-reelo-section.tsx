import { Check, X } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const WITHOUT = [
  "Excel sheets",
  "Manual customer checking",
  "Forgotten follow-ups",
  "Generic messages",
  "No clear daily priorities",
  "Limited visibility into what happened",
];

const WITH = [
  "Daily recommendations",
  "Know why each customer matters",
  "Personalized messages",
  "WhatsApp outreach",
  "Website lead capture",
  "Follow-up automation",
  "Analytics",
];

export function WhyReeloSection() {
  return (
    <section className="border-b border-border/80 bg-muted/30">
      <div className="container py-16 sm:py-20">
        <SectionHeading heading="Stop letting customer data sit unused." />
        <Reveal className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-6 transition-shadow duration-200 hover:shadow-md">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Without Reelo</p>
            <ul className="mt-4 space-y-3">
              {WITHOUT.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-white p-6 shadow-md shadow-brand-500/5 transition-shadow duration-200 hover:shadow-lg hover:shadow-brand-500/15">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">With Reelo</p>
            <ul className="mt-4 space-y-3">
              {WITH.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
