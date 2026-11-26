"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  className?: string;
}

/**
 * Signs the user out of Supabase Auth and sends them to /login.
 *
 * `router.refresh()` after `signOut()` is what forces the (app) layout's
 * server-side `getUser()` check to re-run so middleware/server state agree
 * immediately, rather than showing stale authenticated UI for a moment.
 */
export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {loading ? "Logging out..." : "Log out"}
    </button>
  );
}
