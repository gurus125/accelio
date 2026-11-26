"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SETTINGS_ITEM, TEAM_ITEM, BILLING_ITEM } from "./nav-items";
import { BUSINESS } from "@/lib/mock-data";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/auth/logout-button";
import type { BusinessMemberRole } from "@/types/database";

interface SidebarProps {
  /** Business name to display — the real business row once signed in, or
   * the mock business otherwise. */
  businessName?: string;
  /** The authenticated user's email, shown so it's clear which account is signed in. Undefined when Supabase isn't configured yet. */
  email?: string;
  /** Phase 15 — "owner" | "staff" | undefined (not signed in / no business
   * yet). Owner-only nav items (Automations, Settings) are hidden for staff. */
  role?: BusinessMemberRole;
}

export function Sidebar({ businessName = BUSINESS.name, email, role }: SidebarProps) {
  const pathname = usePathname();
  const isOwner = role !== "staff"; // default to showing everything pre-role-resolution

  const items = NAV_ITEMS.filter((item) => !("ownerOnly" in item && item.ownerOnly) || isOwner);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white transition-transform duration-200 hover:scale-105">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Reelo</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 hover:translate-x-0.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {role && (
          <Link
            href={TEAM_ITEM.href}
            aria-current={pathname.startsWith(TEAM_ITEM.href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 hover:translate-x-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              pathname.startsWith(TEAM_ITEM.href)
                ? "bg-brand-50 text-brand-700"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <TEAM_ITEM.icon className="h-4 w-4" />
            {TEAM_ITEM.label}
          </Link>
        )}
      </nav>

      <div className="space-y-1 px-3 pb-3">
        {isOwner && (
          <Link
            href={BILLING_ITEM.href}
            aria-current={pathname.startsWith(BILLING_ITEM.href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 hover:translate-x-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              pathname.startsWith(BILLING_ITEM.href)
                ? "bg-brand-50 text-brand-700"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <BILLING_ITEM.icon className="h-4 w-4" />
            {BILLING_ITEM.label}
          </Link>
        )}
        {isOwner && (
          <Link
            href={SETTINGS_ITEM.href}
            aria-current={pathname.startsWith(SETTINGS_ITEM.href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 hover:translate-x-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              pathname.startsWith(SETTINGS_ITEM.href)
                ? "bg-brand-50 text-brand-700"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <SETTINGS_ITEM.icon className="h-4 w-4" />
            {SETTINGS_ITEM.label}
          </Link>
        )}
      </div>

      <div className="space-y-3 border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar name={businessName} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium">{businessName}</p>
              {role && (
                <Badge variant={role === "owner" ? "default" : "muted"} className="shrink-0 text-[10px] capitalize">
                  {role}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {email ?? `${BUSINESS.type} · ${BUSINESS.city}`}
            </p>
          </div>
        </div>
        {email && <LogoutButton />}
      </div>
    </aside>
  );
}
