import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-violet-600">
      <div className="glow-blob -left-10 -top-16 h-64 w-64 bg-white/40" aria-hidden="true" />
      <div className="glow-blob -right-10 bottom-0 h-72 w-72 bg-violet-300/50" style={{ animationDelay: "-3s" }} aria-hidden="true" />
      <div className="bg-dot-grid absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      <div className="container relative flex flex-col items-center gap-4 py-20 text-center text-white">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          Ready when you are
        </span>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Your next repeat customer might already be in your database.
        </h2>
        <p className="text-brand-50">Let Accelio find them.</p>
        <Link
          href="/signup"
          className={buttonVariants({
            size: "lg",
            variant: "secondary",
            className: "btn-shine mt-2 shadow-xl shadow-black/10",
          })}
        >
          Start for free
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-sm text-brand-50/90">No credit card required.</p>
      </div>
    </section>
  );
}
