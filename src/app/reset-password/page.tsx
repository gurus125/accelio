"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { AuthError } from "@/components/auth/auth-error";
import { createClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth/errors";

const MIN_PASSWORD_LENGTH = 8;

type SessionCheck = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionCheck, setSessionCheck] = React.useState<SessionCheck>("checking");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    // The recovery link's /auth/callback exchange should have already left
    // us with a real session by the time this page loads — confirm that
    // rather than assuming it, so an expired/reused link fails clearly.
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setSessionCheck(data.user ? "ready" : "invalid");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(getAuthErrorMessage(updateError));
        setLoading(false);
        return;
      }
      setDone(true);
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
          <span className="text-lg font-semibold tracking-tight">Reelo</span>
        </Link>

        {sessionCheck === "checking" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-7 text-center shadow-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking your reset link...</p>
          </div>
        )}

        {sessionCheck === "invalid" && (
          <div className="rounded-2xl border border-border bg-white p-7 text-center shadow-card">
            <h1 className="text-xl font-semibold">This link isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Request a new one to continue.
            </p>
            <Link href="/forgot-password" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              Request a new link
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {sessionCheck === "ready" && done && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-7 text-center shadow-card">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-50">
              <CheckCircle2 className="h-7 w-7 text-success-600" />
            </div>
            <h1 className="text-xl font-semibold">Password updated</h1>
            <p className="text-sm text-muted-foreground">You&apos;re all set — continue to your dashboard.</p>
            <Button className="mt-2 w-full" onClick={() => router.push("/dashboard")}>
              Go to dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {sessionCheck === "ready" && !done && (
          <div className="rounded-2xl border border-border bg-white p-7 shadow-card">
            <h1 className="text-xl font-semibold">Choose a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Make it at least {MIN_PASSWORD_LENGTH} characters.</p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <AuthError message={error} />
              <PasswordField
                id="password"
                label="New password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                autoComplete="new-password"
                placeholder="••••••••"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
