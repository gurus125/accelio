"use client";

import * as React from "react";

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}

/**
 * Counts up from 0 to `value` once, the first time it scrolls into view —
 * same one-shot IntersectionObserver approach as `Reveal`. Purely a visual
 * flourish over illustrative numbers already used elsewhere on the page
 * (`example-data.ts`'s `ANALYTICS_EXAMPLE`), never anything live/real.
 */
export function AnimatedCounter({ value, suffix = "", prefix = "", durationMs = 1200, className }: AnimatedCounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = React.useState(0);
  const started = React.useRef(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setDisplay(value);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / durationMs, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(eased * value));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}
