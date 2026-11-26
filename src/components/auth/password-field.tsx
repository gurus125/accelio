"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  /** Optional element rendered to the right of the label, e.g. a "Forgot password?" link. */
  labelExtra?: React.ReactNode;
}

/**
 * A password <Input> with a show/hide toggle. Used for every password field
 * in the auth flow (login, signup, confirm password, reset password) so the
 * behavior — and the "don't ever leave it visible by default" default — is
 * defined in exactly one place.
 */
export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, labelExtra, id, className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          {labelExtra}
        </div>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            className={cn("pr-10", className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            tabIndex={-1}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }
);
PasswordField.displayName = "PasswordField";
