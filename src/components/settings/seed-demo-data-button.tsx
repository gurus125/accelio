"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { seedDemoCustomers } from "@/lib/dev/seed";

export function SeedDemoDataButton() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const result = await seedDemoCustomers();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(`Added ${result.inserted ?? 0} sample customers.`);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <InlineError message={error} />
      {message && (
        <p role="status" className="text-sm text-success-600">
          {message}
        </p>
      )}
      <Button size="sm" variant="secondary" onClick={handleClick} disabled={loading}>
        {loading ? "Adding..." : "Load demo customers"}
      </Button>
    </div>
  );
}
