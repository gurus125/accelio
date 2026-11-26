"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InlineError } from "@/components/inline-error";
import { addCustomerEvent } from "@/lib/customers/actions";

export function AddActivityButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [service, setService] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await addCustomerEvent(customerId, {
      eventType: "visit",
      service: service || undefined,
      amount: amount ? Number(amount) : undefined,
      notes: notes || undefined,
    });

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setService("");
    setAmount("");
    setNotes("");
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Add activity
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add activity"
        description="Log a visit or service for this customer."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <InlineError message={error} />
          <div className="space-y-1.5">
            <label htmlFor="event-service" className="text-sm font-medium">
              Service (optional)
            </label>
            <Input
              id="event-service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. Haircut"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="event-amount" className="text-sm font-medium">
              Amount (optional)
            </label>
            <Input
              id="event-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="event-notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <Textarea id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Add activity"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
