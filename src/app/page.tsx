import type { Metadata } from "next";
import { SiteNavbar } from "@/components/marketing/site-navbar";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollProgress } from "@/components/marketing/scroll-progress";
import { HeroSection } from "@/components/marketing/hero-section";
import { ProblemSection } from "@/components/marketing/problem-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { RecommendationsSection } from "@/components/marketing/recommendations-section";
import { WhatsappOutreachSection } from "@/components/marketing/whatsapp-outreach-section";
import { CustomerJourneySection } from "@/components/marketing/customer-journey-section";
import { LeadCaptureSection } from "@/components/marketing/lead-capture-section";
import { AutomationSection } from "@/components/marketing/automation-section";
import { AnalyticsSection } from "@/components/marketing/analytics-section";
import { UseCasesSection } from "@/components/marketing/use-cases-section";
import { WhyReeloSection } from "@/components/marketing/why-reelo-section";
import { PricingPreviewSection } from "@/components/marketing/pricing-preview-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Reelo — Turn Existing Customers Into Repeat Customers",
  description:
    "Reelo helps local businesses identify customers worth contacting, create personalized messages, reach them through WhatsApp, and bring customers back.",
  openGraph: {
    title: "Reelo — Turn Existing Customers Into Repeat Customers",
    description:
      "Reelo helps local businesses identify customers worth contacting, create personalized messages, reach them through WhatsApp, and bring customers back.",
    type: "website",
  },
};

/**
 * The public marketing homepage. Every section below is its own component
 * under `src/components/marketing/`, composed here in the exact order the
 * Phase 17 spec lays out — see each component for the section it renders.
 * Illustrative product-visual content (customer names, example numbers,
 * the sample WhatsApp message, etc.) lives in `marketing/example-data.ts`,
 * kept separate from layout so it can be swapped for an admin-panel/CMS
 * feed later without touching any component.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <ScrollProgress />
      <SiteNavbar />
      {/* Hero is above the fold and animates in on load, not on scroll —
       * every section below it is scroll-revealed the first time it enters
       * the viewport (see Reveal's own comment for why this is one-shot). */}
      <HeroSection />
      <Reveal><ProblemSection /></Reveal>
      <Reveal><HowItWorksSection /></Reveal>
      <Reveal><RecommendationsSection /></Reveal>
      <Reveal><WhatsappOutreachSection /></Reveal>
      <Reveal><CustomerJourneySection /></Reveal>
      <Reveal><LeadCaptureSection /></Reveal>
      <Reveal><AutomationSection /></Reveal>
      <Reveal><AnalyticsSection /></Reveal>
      <Reveal><UseCasesSection /></Reveal>
      <Reveal><WhyReeloSection /></Reveal>
      <Reveal><PricingPreviewSection /></Reveal>
      <Reveal><FaqSection /></Reveal>
      <Reveal><FinalCtaSection /></Reveal>
      <SiteFooter />
    </div>
  );
}
