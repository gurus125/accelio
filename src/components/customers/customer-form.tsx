"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/inline-error";
import { createCustomer, updateCustomer, type CustomerInput } from "@/lib/customers/actions";
import type { CustomerStatus } from "@/types";

const STATUS_OPTIONS: { value: CustomerStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "due", label: "Due to return" },
  { value: "inactive", label: "Inactive" },
  { value: "follow_up", label: "Follow up" },
];

interface CustomerFormProps {
  /** Present when editing an existing customer; absent when creating a new one. */
  customerId?: string;
  initial?: Partial<CustomerInput>;
  onDone: () => void;
}

export function CustomerForm({ customerId, initial, onDone }: CustomerFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [phone, setPhone] = React.useState(initial?.phone ?? "");
  const [status, setStatus] = React.useState<CustomerStatus>(initial?.status ?? "active");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: CustomerInput = { name, phone, status, notes };
    const result = customerId ? await updateCustomer(customerId, input) : await createCustomer(input);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InlineError message={error} />
      <div className="space-y-1.5">
        <label htmlFor="customer-name" className="text-sm font-medium">
          Name
        </label>
        <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="customer-phone" className="text-sm font-medium">
          Phone
        </label>
        <Input id="customer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="customer-status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="customer-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CustomerStatus)}
          className="flex h-10 w-full rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="customer-notes" className="text-sm font-medium">
          Notes (optional)
        </label>
        <Textarea id="customer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : customerId ? "Save changes" : "Add customer"}
        </Button>
      </div>
    </form>
  );
}

/** Small "Edit" button + modal wrapper around `CustomerForm`, for the
 * customer profile page. */
export function EditCustomerButton({ customerId, initial }: { customerId: string; initial: CustomerInput }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit customer">
        <CustomerForm customerId={customerId} initial={initial} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
