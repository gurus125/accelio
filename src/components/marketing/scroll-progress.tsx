"use client";

import * as React from "react";

/**
 * A slim gradient bar pinned under the sticky navbar that fills with
 * scroll depth — a common "premium site" cue that also doubles as a
 * subtle reading-progress indicator on a fairly long single-page layout.
 * Reads scroll position only; no state kept anywhere, nothing sent
 * anywhere.
 */
export function ScrollProgress() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(scrollTop / max, 1) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-30 h-0.5 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 transition-[width] duration-150 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
