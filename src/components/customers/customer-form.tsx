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
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [whatsappConsent, setWhatsappConsent] = React.useState(initial?.whatsappConsent ?? false);
  const optedOutAt = initial?.optedOutAt ?? null;
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: CustomerInput = { name, phone, notes, whatsappConsent };
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
        <Input
          id="customer-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </div>
      <div className="rounded-xl border border-border p-3">
        {optedOutAt ? (
          <p className="text-sm text-muted-foreground">
            Opted out of WhatsApp on {new Date(optedOutAt).toLocaleDateString("en-IN")} (replied STOP). They can reply
            START to opt back in. / ग्राहक ने STOP भेजकर मना किया है।
          </p>
        ) : (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
              checked={whatsappConsent}
              onChange={(e) => setWhatsappConsent(e.target.checked)}
            />
            <span>
              <span className="font-medium">Customer agreed to WhatsApp reminders &amp; offers</span>
              <span className="block text-muted-foreground">ग्राहक ने WhatsApp पर मैसेज के लिए हाँ कहा</span>
            </span>
          </label>
        )}
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
