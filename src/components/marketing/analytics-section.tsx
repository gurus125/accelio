import { CheckCheck, MessageSquareText, Repeat, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { SectionHeading } from "./section-heading";
import { ProductFrame } from "./product-frame";
import { Reveal } from "./reveal";
import { ACTIVITY_TREND, ANALYTICS_EXAMPLE } from "./example-data";

function ActivityChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 320;
  const height = 96;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#3b6ef6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,${height} ${points} ${width},${height}`} fill="#3b6ef6" opacity={0.08} />
    </svg>
  );
}

export function AnalyticsSection() {
  return (
    <section className="border-b border-border/80 bg-muted/30">
      <div className="container py-16 sm:py-20">
        <SectionHeading heading="Know what happened after you reached out." />

        <Reveal className="mx-auto mt-12 max-w-4xl">
          <ProductFrame label="Analytics">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={Users} value={ANALYTICS_EXAMPLE.customersContacted} label="Customers contacted" />
              <StatCard icon={CheckCheck} value={ANALYTICS_EXAMPLE.messagesDelivered} label="Messages delivered" />
              <StatCard icon={MessageSquareText} value={ANALYTICS_EXAMPLE.replies} label="Replies" />
              <StatCard
                icon={Repeat}
                value={ANALYTICS_EXAMPLE.returnedAfterOutreach}
                label="Returned after Accelio outreach"
                tone="warning"
              />
            </div>
            <div className="mt-5 rounded-xl border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Outreach activity over time
              </p>
              <div className="mt-2">
                <ActivityChart values={ACTIVITY_TREND} />
              </div>
            </div>
          </ProductFrame>
        </Reveal>
      </div>
    </section>
  );
}
