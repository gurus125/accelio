import { MailCheck } from "lucide-react";

interface CheckEmailNoticeProps {
  title: string;
  description: string;
  email?: string;
}

/**
 * Shared "we sent you an email" screen — used both after signup when email
 * confirmation is required, and after requesting a password reset.
 */
export function CheckEmailNotice({ title, description, email }: CheckEmailNoticeProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-white p-7 text-center shadow-card">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <MailCheck className="h-7 w-7 text-brand-600" />
      </div>
      <h1 className="mt-5 text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {description}
        {email && (
          <>
            {" "}
            <span className="font-medium text-foreground">{email}</span>
          </>
        )}
      </p>
    </div>
  );
}
