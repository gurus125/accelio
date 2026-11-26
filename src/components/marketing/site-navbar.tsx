"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#use-cases", label: "Use cases" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteNavbar() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-white/90 backdrop-blur transition-shadow duration-200",
        scrolled ? "border-border shadow-sm" : "border-border/80 shadow-none"
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="group flex items-center gap-2" onClick={() => setOpen(false)}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white transition-transform duration-200 group-hover:scale-105">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Reelo</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative py-1 transition-colors hover:text-foreground after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-foreground after:transition-all after:duration-200 hover:after:w-full"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Start for free
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-transform duration-150 active:scale-90 md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="animate-fade-in-up border-t border-border/80 bg-white md:hidden">
          <nav className="container flex flex-col gap-1 py-3 text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-foreground transition-colors hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/80 pt-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className={buttonVariants({ size: "default", className: "w-full" })}
              >
                Start for free
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
