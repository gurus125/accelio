import Link from "next/link";
import { Sparkles } from "lucide-react";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#use-cases", label: "Use cases" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="py-12">
      <div className="container">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className="font-semibold text-foreground">Reelo</span>
            </div>
            <p className="mt-3 max-w-[16rem] text-sm text-muted-foreground">
              Helping local businesses turn existing customers into repeat customers.
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-sm font-semibold text-foreground">{column.heading}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/80 pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© 2026 Reelo. Made for local businesses.</p>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Log in
          </Link>
        </div>
      </div>
    </footer>
  );
}
