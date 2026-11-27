"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

interface FaqItem {
  question: string;
  /**
   * PLACEHOLDER — intentionally left unset for every question below.
   * These questions come from the Phase 17 spec; their answers do not,
   * and writing them here would mean inventing product copy rather than
   * using content someone actually approved. `null` renders a clearly
   * labeled "coming soon" placeholder instead of fabricated text. Wire
   * this up to the admin panel/CMS later — set `answer` to a string (or
   * fetch these objects from that panel) and the placeholder disappears
   * automatically, no component changes needed.
   */
  answer: string | null;
}

const FAQS: FaqItem[] = [
  { question: "What is Accelio?", answer: null },
  { question: "How does Accelio find customers worth contacting?", answer: null },
  { question: "Do I need technical knowledge?", answer: null },
  { question: "Can I import my existing customer data?", answer: null },
  { question: "Does Accelio automatically send WhatsApp messages?", answer: null },
  { question: "Can I start for free?", answer: null },
  { question: "Which businesses can use Accelio?", answer: null },
  { question: "Can I upgrade later?", answer: null },
  { question: "Does Accelio replace WhatsApp?", answer: null },
];

function FaqRow({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border transition-colors hover:bg-muted/20">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-1 py-4 text-left"
      >
        <span className={cn("font-medium transition-colors", isOpen && "text-brand-700")}>{item.question}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-180 text-brand-600"
          )}
        />
      </button>
      {/* CSS grid-rows trick for an animatable "height: auto" — a plain
          conditional render can't transition since there's no fixed
          height to interpolate to/from. */}
      <div
        className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-1 pb-4 text-sm text-muted-foreground">
            {item.answer ?? "We're finalizing this answer — check back soon."}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <section className="border-b border-border/80 bg-muted/30">
      <div className="container py-16 sm:py-20">
        <SectionHeading heading="Frequently asked questions" />
        <Reveal className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-white px-6">
          {FAQS.map((item, idx) => (
            <FaqRow
              key={item.question}
              item={item}
              isOpen={openIndex === idx}
              onToggle={() => setOpenIndex((current) => (current === idx ? null : idx))}
            />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
