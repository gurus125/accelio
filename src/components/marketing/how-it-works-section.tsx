import { Eye, Link2, MessageSquareText, LineChart, Search, Send } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const STEPS = [
  { number: "01", icon: Link2, title: "Connect", description: "Connect your existing customer data." },
  { number: "02", icon: Search, title: "Find", description: "Reelo finds customers worth contacting." },
  { number: "03", icon: Eye, title: "Understand", description: "See why each customer matters." },
  {
    number: "04",
    icon: MessageSquareText,
    title: "Message",
    description: "Get a personalized message you can review and edit.",
  },
  { number: "05", icon: Send, title: "Reach", description: "Approve and send through WhatsApp." },
  { number: "06", icon: LineChart, title: "Track", description: "Track delivery, replies, and customer returns." },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-border/80 bg-muted/30">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Reelo turns customer data into action."
          subheading="From customer history to meaningful outreach in a few simple steps."
        />
        <div className="relative mx-auto mt-14 max-w-5xl">
          {/* The connecting line — a purely decorative flow cue, hidden on
              mobile where the steps stack vertically instead. */}
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent sm:block" aria-hidden="true" />
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-12">
            {STEPS.map((step, idx) => (
              <Reveal key={step.number} delayMs={idx * 70}>
                <div className="group relative flex flex-col items-start gap-3 sm:items-center sm:text-center">
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-600 shadow-soft transition-all duration-200 group-hover:-translate-y-1 group-hover:border-brand-400 group-hover:text-white group-hover:bg-gradient-to-br group-hover:from-brand-500 group-hover:to-brand-600 group-hover:shadow-lg group-hover:shadow-brand-500/30">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-brand-600">STEP {step.number}</p>
                    <h3 className="mt-1 font-semibold">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground sm:max-w-[16rem]">{step.description}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
