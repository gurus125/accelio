import { ArrowRight, Bell, CalendarClock, UserPlus, Zap } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const AUTOMATIONS = [
  {
    icon: UserPlus,
    title: "New lead follow-up",
    trigger: "New website lead",
    action: "Follow up",
  },
  {
    icon: CalendarClock,
    title: "Due for return",
    trigger: "Customer becomes due",
    action: "Reminder",
  },
  {
    icon: Bell,
    title: "Service reminder",
    trigger: "Service becomes due",
    action: "Reminder",
  },
  {
    icon: Zap,
    title: "Follow-up",
    trigger: "Customer needs attention",
    action: "Follow up",
  },
];

export function AutomationSection() {
  return (
    <section className="border-b border-border/80">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Let Accelio handle the routine follow-ups."
          subheading="Set up routine workflows once and keep control over what Accelio sends."
        />
        <Reveal className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {AUTOMATIONS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-white p-5 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <item.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {item.title}
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-foreground">{item.trigger}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground">{item.action}</span>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
