"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineError } from "@/components/inline-error";
import { connectWhatsApp, disconnectWhatsApp } from "@/lib/whatsapp/actions";
import type { WhatsAppConnectionStatus } from "@/lib/whatsapp/types";

interface WhatsAppConnectionCardProps {
  envConfigured: boolean;
  status: WhatsAppConnectionStatus;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string | null;
}

/**
 * The real Phase 8 WhatsApp setup screen. Never fakes a successful
 * connection — "Connected" only ever reflects a `whatsapp_connections` row
 * that was actually verified against Meta's API (see
 * `connectWhatsApp`/`verifyPhoneNumberId`).
 */
export function WhatsAppConnectionCard({
  envConfigured,
  status,
  phoneNumberId,
  businessAccountId,
  displayPhoneNumber,
}: WhatsAppConnectionCardProps) {
  const [phoneNumberIdInput, setPhoneNumberIdInput] = React.useState(phoneNumberId);
  const [businessAccountIdInput, setBusinessAccountIdInput] = React.useState(businessAccountId);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await connectWhatsApp({
      phoneNumberId: phoneNumberIdInput,
      businessAccountId: businessAccountIdInput,
    });
    setPending(false);
    if (result.error) setError(result.error);
  };

  const handleDisconnect = async () => {
    setPending(true);
    setError(null);
    const result = await disconnectWhatsApp();
    setPending(false);
    if (result.error) setError(result.error);
  };

  if (!envConfigured) {
    return (
      <div className="space-y-1.5">
        <Badge variant="muted">Not connected</Badge>
        <p className="text-sm text-muted-foreground">
          WhatsApp isn&apos;t connected yet. A server administrator needs to add{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">WHATSAPP_ACCESS_TOKEN</code> (and the related Meta
          WhatsApp Cloud API credentials) to the environment before any business can connect a number — see{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.example</code>.
        </p>
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Connected</Badge>
          <p className="text-sm text-muted-foreground">{displayPhoneNumber ?? phoneNumberId}</p>
        </div>
        <InlineError message={error} />
        <Button size="sm" variant="secondary" onClick={handleDisconnect} disabled={pending}>
          {pending ? "Disconnecting..." : "Disconnect"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="space-y-4">
      <Badge variant={status === "error" ? "danger" : "muted"}>
        {status === "error" ? "Connection error" : "Not connected"}
      </Badge>

      {/* Phase 20 — plain-language trust explanation leads, before the
          unavoidable technical fields below. Meta's WhatsApp Cloud API
          genuinely requires a Phone Number ID and access token from their
          own developer console — Reelo can't remove that step without a
          full Embedded Signup integration, which is out of scope here — so
          the fix is making clear WHY this is needed and that the business
          stays in control, not hiding the fields themselves. */}
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li>• Connecting WhatsApp lets Reelo send the messages you approve — reminders, follow-ups, replies.</li>
        <li>• Reelo never sends anything on its own. You review and approve every message first.</li>
        <li>• You can disconnect at any time from this page.</li>
      </ul>

      <div className="space-y-1.5 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Where do I find these?</p>
        <p>
          Two values from your WhatsApp Business setup in Meta Business Manager: the Phone Number ID is required;
          the Business Account ID is optional. If you haven&apos;t set up a WhatsApp Business Account with Meta
          yet, that&apos;s a one-time step on their side before you can connect it here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="wa-phone-number-id" className="text-sm font-medium">
            Phone Number ID
          </label>
          <Input
            id="wa-phone-number-id"
            value={phoneNumberIdInput}
            onChange={(e) => setPhoneNumberIdInput(e.target.value)}
            placeholder="e.g. 109876543210987"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="wa-business-account-id" className="text-sm font-medium">
            Business Account ID (optional)
          </label>
          <Input
            id="wa-business-account-id"
            value={businessAccountIdInput}
            onChange={(e) => setBusinessAccountIdInput(e.target.value)}
            placeholder="e.g. 123456789012345"
          />
        </div>
      </div>
      <InlineError message={error} />
      <Button size="sm" type="submit" disabled={pending || !phoneNumberIdInput.trim()}>
        {pending ? "Connecting..." : "Connect WhatsApp"}
      </Button>
    </form>
  );
}
