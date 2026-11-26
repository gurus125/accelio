"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthError } from "@/components/auth/auth-error";
import { CheckEmailNotice } from "@/components/auth/check-email-notice";
import { createClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth/errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      // Supabase intentionally returns success even for an email that isn't
      // registered, to avoid leaking which emails have accounts. We do the
      // same — only real errors (bad format, rate limit, network) surface.
      if (resetError) {
        setError(getAuthErrorMessage(resetError));
        setLoading(false);
        return;
      }

      setSent(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Accelio</span>
        </Link>

        {sent ? (
          <CheckEmailNotice
            title="Check your email"
            description="If an account exists for"
            email={email.trim()}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-white p-7 shadow-card">
            <h1 className="text-xl font-semibold">Reset your password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a link to reset it.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <AuthError message={error} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="email">Email</label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@business.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Sending link..." : "Send reset link"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
