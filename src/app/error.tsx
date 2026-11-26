"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a later phase this reports to a real error-tracking service.
    // For now, keep it visible in the server/browser console during development.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-50">
        <AlertTriangle className="h-7 w-7 text-danger-600" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        This page ran into an unexpected error. You can try again, or head back to your dashboard.
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
