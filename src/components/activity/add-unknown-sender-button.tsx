"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/inline-error";
import { addCustomerFromUnknownSender } from "@/lib/whatsapp/actions";

/**
 * Phase 9 — the ONLY way an inbound WhatsApp message from an unrecognized
 * number turns into a customer record: an explicit click here, with a name
 * the owner types in themselves. Nothing in Phase 9 creates a customer
 * automatically from WhatsApp traffic.
 */
export function AddUnknownSenderButton({ customerMessageId, fromPhone }: { customerMessageId: string; fromPhone: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await addCustomerFromUnknownSender(customerMessageId, name);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setName("");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        Add as customer
      </Button>
      <Modal
        open={open}
        onClose={() => !submitting && setOpen(false)}
        title="Add as customer"
        description={`Save ${fromPhone} as a customer in Reelo.`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <InlineError message={error} />
          <div className="space-y-1.5">
            <label htmlFor="unknown-sender-name" className="text-sm font-medium">
              Customer name
            </label>
            <Input
              id="unknown-sender-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Add customer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
