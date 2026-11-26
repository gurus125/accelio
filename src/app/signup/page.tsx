"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { AuthError } from "@/components/auth/auth-error";
import { CheckEmailNotice } from "@/components/auth/check-email-notice";
import { createClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth/errors";

const MIN_PASSWORD_LENGTH = 8;

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const invitedEmail = searchParams.get("invitedEmail");
  // Phase 15 — someone arriving via a staff invite link skips the
  // "create a business" onboarding entirely; they're joining an
  // existing one, not starting their own (see /invite/[token]).
  const isInviteFlow = Boolean(next?.startsWith("/invite/"));

  const [businessName, setBusinessName] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [email, setEmail] = React.useState(invitedEmail ?? "");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState(false);

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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Stored on the Supabase Auth user itself (user_metadata) — there's
          // no `businesses` table yet (that's Phase 4). This is a deliberately
          // temporary home for these two fields, read back via
          // `user.user_metadata` wherever the business name is shown.
          data: {
            business_name: businessName.trim(),
            owner_name: ownerName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next && next.startsWith("/") ? next : "/onboarding")}`,
        },
      });

      if (signUpError) {
        setError(getAuthErrorMessage(signUpError));
        setLoading(false);
        return;
      }

      // If email confirmation is required, Supabase returns a user but no
      // session — don't assume the user is logged in until they confirm.
      if (data.user && !data.session) {
        setAwaitingConfirmation(true);
        setLoading(false);
        return;
      }

      router.push(next && next.startsWith("/") ? next : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setLoading(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Accelio</span>
          </Link>
          <CheckEmailNotice
            title="Check your email"
            description="We sent a confirmation link to"
            email={email.trim()}
          />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already confirmed?{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Accelio</span>
        </Link>

        <div className="rounded-2xl border border-border bg-white p-7 shadow-card">
          <h1 className="text-xl font-semibold">{isInviteFlow ? "Join your team on Accelio" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isInviteFlow ? "Set a password to accept your invitation." : "Start bringing your customers back."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <AuthError message={error} />
            {!isInviteFlow && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="business">Business name</label>
                  <Input
                    id="business"
                    placeholder="Luxury Hair Studio"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="owner">Owner name</label>
                  <Input
                    id="owner"
                    placeholder="Your name"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                  />
                </div>
              </>
            )}
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
            <PasswordField
              id="password"
              label="Password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Creating account..." : "Create account"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <React.Suspense fallback={null}>
      <SignupForm />
    </React.Suspense>
  );
}
