import { ArrowRight, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SectionHeading } from "./section-heading";
import { ProductFrame } from "./product-frame";
import { Reveal } from "./reveal";
import { LEAD_EXAMPLE } from "./example-data";

export function LeadCaptureSection() {
  return (
    <section className="border-b border-border/80 bg-muted/30">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Don't lose customers who are already interested."
          subheading="Capture website enquiries and turn interested visitors into customers."
        />

        <Reveal className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 sm:items-center">
          {/* The website widget the visitor sees */}
          <div className="rounded-2xl border border-border bg-white p-6 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On your website</p>
            <div className="mt-4 rounded-xl border border-border p-4">
              <p className="font-medium">Want our price list?</p>
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-success-600">
                <MessageCircle className="h-4 w-4" />
                <span>Get pricing on WhatsApp</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* What lands in Reelo */}
          <ProductFrame label="Leads">
            <Badge variant="success" className="mb-3">
              New lead
            </Badge>
            <div className="flex items-center gap-3">
              <Avatar name={LEAD_EXAMPLE.name} />
              <div>
                <p className="font-medium">{LEAD_EXAMPLE.name}</p>
                <p className="text-sm text-muted-foreground">
                  Interest: {LEAD_EXAMPLE.interest} · Source: {LEAD_EXAMPLE.source}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={buttonVariants({ size: "sm" })}>Contact</span>
              <span className={buttonVariants({ size: "sm", variant: "secondary" })}>View lead</span>
            </div>
          </ProductFrame>
        </Reveal>
      </div>
    </section>
  );
}
