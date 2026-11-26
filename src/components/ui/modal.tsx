"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Phase 20 accessibility fix — every dialog in the app shares this
  // component, and none of them moved keyboard/screen-reader focus into
  // the dialog when it opened (it silently stayed on whatever button
  // triggered it, in the now-hidden-behind-an-overlay page). Focusing the
  // panel itself on open, and returning focus to the trigger on close, is
  // the standard accessible-dialog pattern and fixes it everywhere at once
  // without touching any dialog's own content or behavior.
  const triggerRef = React.useRef<Element | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    triggerRef.current = document.activeElement;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      window.clearTimeout(focusTimer);
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-xl animate-scale-in",
          "focus:outline-none",
          className
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {title && <h2 className="text-lg font-semibold pr-6">{title}</h2>}
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
