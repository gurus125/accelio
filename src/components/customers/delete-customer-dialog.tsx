"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/inline-error";
import { deleteCustomer } from "@/lib/customers/actions";

interface DeleteCustomerDialogProps {
  customerId: string;
  customerName: string;
  /** Where to send the user after a successful delete (e.g. back to the list). */
  redirectTo: string;
}

export function DeleteCustomerDialog({ customerId, customerName, redirectTo }: DeleteCustomerDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const result = await deleteCustomer(customerId);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete customer?"
        description={`This permanently removes ${customerName} and their activity history. This can't be undone.`}
      >
        <InlineError message={error} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete customer"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
