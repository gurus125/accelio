import { Home, Target, Users, Megaphone, Activity, BarChart3, Settings, Globe, Zap, UserCog, CreditCard } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/leads", label: "Leads", icon: Globe },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  // Owner-only — filtered out for staff in Sidebar/MobileNav below.
  { href: "/automations", label: "Automations", icon: Zap, ownerOnly: true },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export const SETTINGS_ITEM = { href: "/settings", label: "Settings", icon: Settings, ownerOnly: true } as const;

/** Phase 15 — Team management, owner-only. Shown as its own sidebar entry
 * (not folded into Settings) since staff can still see a read-only version
 * of it ("You / Staff"), unlike Settings which is fully hidden from them. */
export const TEAM_ITEM = { href: "/team", label: "Team", icon: UserCog } as const;

/** Phase 16 — Billing, owner-only management (staff who navigate here
 * directly see a friendly "your business owner manages this" page instead
 * of a crash or a silent redirect — see `/billing`'s page component). Kept
 * out of the owner-only-filtered `NAV_ITEMS` array and placed next to
 * `SETTINGS_ITEM` in the sidebar instead, matching how rarely-touched,
 * owner-only administrative pages are already grouped there. */
export const BILLING_ITEM = { href: "/billing", label: "Billing", icon: CreditCard, ownerOnly: true } as const;
