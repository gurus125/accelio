import { MessageSquareText, Send, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SectionHeading } from "./section-heading";
import { ProductFrame } from "./product-frame";
import { Reveal } from "./reveal";
import { FEATURED_RECOMMENDATION, RECOMMENDATION_CATEGORIES } from "./example-data";

export function RecommendationsSection() {
  return (
    <section className="border-b border-border/80">
      <div className="container py-16 sm:py-20">
        <SectionHeading
          heading="Every day, Reelo tells you who to contact."
          subheading="No spreadsheets. No guessing. No searching through hundreds of customers."
        />

        <Reveal className="mx-auto mt-12 max-w-3xl">
          <ProductFrame label="Recommendations">
            <div className="flex flex-wrap gap-2">
              {RECOMMENDATION_CATEGORIES.map((label) => (
                <Badge key={label} variant="muted">
                  {label}
                </Badge>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Avatar name={FEATURED_RECOMMENDATION.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{FEATURED_RECOMMENDATION.name}</p>
                    <Badge>Due to return</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{FEATURED_RECOMMENDATION.question}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{FEATURED_RECOMMENDATION.reason}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={buttonVariants({ size: "sm", variant: "secondary" })}>
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Generate message
                </span>
                <span className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  <UserRound className="h-3.5 w-3.5" />
                  View customer
                </span>
                <span className={buttonVariants({ size: "sm" })}>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </span>
              </div>
            </div>
          </ProductFrame>
        </Reveal>

        <p className="mx-auto mt-8 max-w-lg text-center text-base font-medium text-foreground">
          You decide who to contact. Reelo helps you take action.
        </p>
      </div>
    </section>
  );
}
