import { Pencil, Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WhatsappBubble } from "@/components/whatsapp-bubble";
import { SectionHeading } from "./section-heading";
import { ProductFrame } from "./product-frame";
import { Reveal } from "./reveal";
import { WHATSAPP_EXAMPLE } from "./example-data";

export function WhatsappOutreachSection() {
  return (
    <section className="border-b border-border/80 bg-muted/30">
      <div className="container py-16 sm:py-20">
        <SectionHeading heading="From recommendation to WhatsApp in seconds." />

        <Reveal className="mx-auto mt-12 max-w-2xl">
          <ProductFrame label="WhatsApp outreach">
            <div className="flex items-start gap-3">
              <Avatar name={WHATSAPP_EXAMPLE.name} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{WHATSAPP_EXAMPLE.name}</p>
                  <Badge>{WHATSAPP_EXAMPLE.reason}</Badge>
                </div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Why</p>
                <p className="text-sm text-muted-foreground">{WHATSAPP_EXAMPLE.why}</p>
              </div>
            </div>

            <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Suggested message
            </p>
            <WhatsappBubble message={WHATSAPP_EXAMPLE.message} className="max-w-md" />

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={buttonVariants({ size: "sm", variant: "secondary" })}>
                <Pencil className="h-3.5 w-3.5" />
                Edit message
              </span>
              <span className={buttonVariants({ size: "sm", variant: "success" })}>
                <Send className="h-3.5 w-3.5" />
                Send on WhatsApp
              </span>
            </div>
          </ProductFrame>
        </Reveal>

        <div className="mx-auto mt-8 max-w-lg text-center">
          <p className="text-base font-medium text-foreground">You stay in control.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Accelio recommends. You review. You approve. You send.
          </p>
        </div>
      </div>
    </section>
  );
}
