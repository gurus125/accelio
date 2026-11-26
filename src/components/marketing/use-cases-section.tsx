import { Dumbbell, GraduationCap, Scissors, Shirt, Stethoscope, Wrench } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const USE_CASES = [
  {
    icon: Scissors,
    business: "Salon & spa",
    quote: "Rahul normally visits every 45 days. It's been 74 days.",
  },
  {
    icon: Wrench,
    business: "Garage",
    quote: "Your customer's next service may be due.",
  },
  {
    icon: Stethoscope,
    business: "Clinic",
    quote: "Follow up with customers who may need another appointment.",
  },
  {
    icon: Dumbbell,
    business: "Gym",
    quote: "Reconnect with members who haven't visited recently.",
  },
  {
    icon: Shirt,
    business: "Boutique",
    quote: "Reconnect with customers who haven't purchased recently.",
  },
  {
    icon: GraduationCap,
    business: "Coaching",
    quote: "Follow up with leads who showed interest.",
  },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" className="border-b border-border/80">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Built for businesses like yours."
          subheading="Salons, garages, boutiques, clinics, gyms, spas, and other businesses where customers come back on their own schedule."
        />
        <Reveal className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((useCase) => (
            <div
              key={useCase.business}
              className="group flex flex-col gap-4 rounded-2xl border border-border bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted transition-colors duration-200 group-hover:bg-brand-50 group-hover:text-brand-600">
                <useCase.icon className="h-5 w-5 text-foreground transition-colors duration-200 group-hover:text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">{useCase.business}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">&ldquo;{useCase.quote}&rdquo;</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
