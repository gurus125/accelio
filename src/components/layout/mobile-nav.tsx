"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { NAV_ITEMS, SETTINGS_ITEM, TEAM_ITEM, BILLING_ITEM } from "./nav-items";
import type { BusinessMemberRole } from "@/types/database";

interface MobileNavProps {
  /** Phase 15 — hides owner-only items (e.g. Automations, Settings) for staff. */
  role?: BusinessMemberRole;
}

/**
 * Phase 20 UX audit finding: the bottom nav only ever showed its first 4-5
 * items, with no way to reach the rest — on a phone there was previously no
 * path at all to Campaigns, Automations, Activity, Analytics, Team, or
 * Billing short of typing the URL. Fixed by keeping the same first 4
 * primary tabs and adding a "More" tab that opens a simple menu with
 * everything else, filtered by role the same way the desktop sidebar
 * already does.
 */
export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();
  const isOwner = role !== "staff";
  const [moreOpen, setMoreOpen] = React.useState(false);

  const base = NAV_ITEMS.filter((item) => !("ownerOnly" in item && item.ownerOnly) || isOwner);
  const primaryTabs = base.slice(0, 4);
  const overflowNavItems = base.slice(4);

  const overflowItems = [
    ...overflowNavItems,
    ...(role ? [TEAM_ITEM] : []),
    ...(isOwner ? [BILLING_ITEM, SETTINGS_ITEM] : []),
  ];
  const overflowHasActiveItem = overflowItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {primaryTabs.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
                active ? "text-brand-600" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform duration-200", active && "scale-110")} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors duration-150 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
            overflowHasActiveItem ? "text-brand-600" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className={cn("h-5 w-5 transition-transform duration-200", overflowHasActiveItem && "scale-110")} />
          More
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More" className="max-w-sm">
        <div className="grid grid-cols-3 gap-3">
          {overflowItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-all duration-150 active:scale-95",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:-translate-y-0.5"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
