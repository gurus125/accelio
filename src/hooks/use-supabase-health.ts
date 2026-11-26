"use client";

import * as React from "react";
import type { HealthCheckResult } from "@/lib/supabase/health";

type State =
  | { state: "loading" }
  | { state: "done"; result: HealthCheckResult }
  | { state: "error" };

/**
 * Client-side hook that asks the `/api/health` route whether Supabase is
 * reachable. Used by the Settings page so the connection can be seen at a
 * glance, without turning the whole Settings page into a client component
 * that fetches on every render.
 */
export function useSupabaseHealth() {
  const [state, setState] = React.useState<State>({ state: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/health")
      .then(async (res) => {
        const result = (await res.json()) as HealthCheckResult;
        if (!cancelled) setState({ state: "done", result });
      })
      .catch(() => {
        if (!cancelled) setState({ state: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
