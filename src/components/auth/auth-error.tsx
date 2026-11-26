import { AlertCircle } from "lucide-react";

/**
 * Inline error banner for auth forms — never a browser alert(). Renders
 * nothing when there's no message, so callers can pass a possibly-empty
 * string/null without an extra conditional at every call site.
 */
export function AuthError({ message }: { message?: string | null }) {
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
