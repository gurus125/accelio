/**
 * Maps raw Supabase Auth error messages to short, friendly copy.
 *
 * Supabase's error strings are stable enough in practice to match on, but
 * are still implementation detail — we never show them to the user directly
 * (per Phase 3 spec: no leaking technical error internals).
 */
export function getAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (message.includes("email not confirmed")) {
    return "Please confirm your email address before logging in — check your inbox for the link we sent.";
  }
  if (message.includes("user already registered") || message.includes("already registered")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (message.includes("password should be at least") || message.includes("password is too short")) {
    return "Password must be at least 8 characters.";
  }
  if (message.includes("unable to validate email") || message.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Network error. Check your connection and try again.";
  }
  if (message.includes("not configured")) {
    return "Sign-in isn't set up yet for this app. Please try again later.";
  }

  return "Something went wrong. Please try again.";
}
