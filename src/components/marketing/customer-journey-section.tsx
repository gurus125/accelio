import { ArrowRight, Globe, Heart, MessageCircle, Repeat, Sparkles, UserPlus, Users } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const JOURNEY = [
  { icon: Globe, label: "Website visitor" },
  { icon: UserPlus, label: "Lead" },
  { icon: Users, label: "Customer" },
  { icon: Sparkles, label: "Accelio recommendation" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Repeat, label: "Repeat visit" },
  { icon: Heart, label: "Loyal customer" },
];

export function CustomerJourneySection() {
  return (
    <section className="border-b border-border/80">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="From lead to repeat customer."
          subheading="Accelio helps you capture interest, manage customer activity, identify opportunities, and bring customers back."
        />
        <Reveal className="mx-auto mt-12 max-w-5xl overflow-x-auto">
          <div className="flex min-w-max items-center justify-center gap-2 sm:min-w-0 sm:flex-wrap sm:gap-3">
            {JOURNEY.map((step, idx) => (
              <div key={step.label} className="flex items-center gap-2 sm:gap-3">
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white px-4 py-4 shadow-soft">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <step.icon className="h-4 w-4" />
                  </div>
                  <p className="whitespace-nowrap text-xs font-medium">{step.label}</p>
                </div>
                {idx < JOURNEY.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
