"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CustomerForm } from "@/components/customers/customer-form";

export function AddCustomerButton({ label = "Add customer", variant = "default" as const }: { label?: string; variant?: "default" | "secondary" } = {}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add customer"
        description="Add a new customer to your list."
      >
        <CustomerForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
