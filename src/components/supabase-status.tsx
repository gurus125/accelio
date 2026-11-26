"use client";

import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useSupabaseHealth } from "@/hooks/use-supabase-health";
import { Badge } from "@/components/ui/badge";

/**
 * Small, self-contained status indicator for the Supabase connection.
 * Phase 2 has no schema and often no real project yet, so "Not configured"
 * is an expected, non-alarming state — not an error.
 */
export function SupabaseStatus() {
  const health = useSupabaseHealth();

  if (health.state === "loading") {
    return (
      <Badge variant="muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking connection...
      </Badge>
    );
  }

  if (health.state === "error") {
    return (
      <Badge variant="danger">
        <XCircle className="h-3 w-3" />
        Could not reach health check
      </Badge>
    );
  }

  const { result } = health;

  if (result.ok) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }

  if (result.status === "not_configured") {
    return <Badge variant="muted">Not configured yet</Badge>;
  }

  return (
    <Badge variant="danger">
      <XCircle className="h-3 w-3" />
      Unreachable
    </Badge>
  );
}
