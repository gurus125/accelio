"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Small stagger for sections that should feel sequenced with a
   * neighbor (rarely needed — most sections just use the default). */
  delayMs?: number;
}

/**
 * Scroll-triggered entrance for marketing sections. Deliberately simple:
 * an IntersectionObserver flips one boolean the first time a section
 * enters the viewport, then disconnects — sections never re-hide on
 * scroll-up, since that reads as gimmicky rather than premium.
 *
 * No animation library added for this — same minimal-dependency approach
 * as the rest of the app. Falls back to already-visible when
 * IntersectionObserver isn't available (very old browsers, some SSR/test
 * environments) so content is never stuck invisible.
 */
export function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(visible ? "animate-fade-in-up" : "opacity-0", className)}
      style={visible && delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
