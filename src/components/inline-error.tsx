import { AlertCircle } from "lucide-react";

/**
 * Inline error banner for the Phase 4 customer/business forms — matches
 * `components/auth/auth-error.tsx`'s styling so error messages look
 * consistent across the app. Renders nothing when there's no message.
 */
export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-sm text-danger-600"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
