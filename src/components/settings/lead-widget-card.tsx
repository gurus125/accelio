"use client";

import * as React from "react";
import { Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { updateWidgetConfig, regenerateWidgetKey } from "@/lib/leads/actions";
import type { LeadWidgetRow } from "@/types/database";

const SOURCE_OPTIONS: { value: LeadWidgetRow["default_source"]; label: string }[] = [
  { value: "website", label: "General website" },
  { value: "website_brochure", label: "Brochure request" },
  { value: "website_pricing", label: "Pricing request" },
  { value: "website_contact", label: "Contact form" },
  { value: "website_booking", label: "Booking request" },
];

function buildSnippet(widgetKey: string, origin: string): string {
  return `<script src="${origin}/accelio-widget.js" data-widget="${widgetKey}" async></script>`;
}

/**
 * Settings screen for a business's website lead-capture form (Phase 13
 * spec step 7/8/30). This is where the owner copies the embed snippet,
 * customizes what it asks for, and — if they ever suspect it leaked —
 * rotates the public `widget_key`.
 */
export function LeadWidgetCard({ widget, siteOrigin }: { widget: LeadWidgetRow; siteOrigin: string }) {
  const [buttonText, setButtonText] = React.useState(widget.button_text);
  const [introText, setIntroText] = React.useState(widget.intro_text ?? "");
  const [consentText, setConsentText] = React.useState(widget.consent_text);
  const [defaultSource, setDefaultSource] = React.useState(widget.default_source);
  const [interestOptionsText, setInterestOptionsText] = React.useState(widget.interest_options.join(", "));
  const [accentColor, setAccentColor] = React.useState(widget.accent_color);
  const [isActive, setIsActive] = React.useState(widget.is_active);

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  const snippet = buildSnippet(widget.widget_key, siteOrigin);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateWidgetConfig({
      buttonText,
      introText,
      consentText,
      defaultSource,
      interestOptions: interestOptionsText.split(",").map((s) => s.trim()).filter(Boolean),
      accentColor,
      isActive,
    });
    setPending(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (older browsers, permissions) — the
      // snippet is still visible to select/copy manually.
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("This will stop the current embed snippet from working. Any website that already has it embedded will need the new one. Continue?")) {
      return;
    }
    setRegenerating(true);
    setError(null);
    const result = await regenerateWidgetKey();
    setRegenerating(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Embed this on your website</p>
        <div className="flex items-start gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            {snippet}
          </code>
          <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Paste this once, anywhere in your site&apos;s HTML — it shows a small &quot;{widget.button_text}&quot; button that
          opens a short form. Visitors only submit their number if they choose to.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4 border-t border-border pt-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Button text</label>
          <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} maxLength={120} required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Intro text (optional)</label>
          <Input
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            placeholder="e.g. Want our price list on WhatsApp?"
            maxLength={300}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Consent text shown under the button</label>
          <Textarea value={consentText} onChange={(e) => setConsentText(e.target.value)} rows={2} maxLength={300} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">What this form is for</label>
            <select
              value={defaultSource}
              onChange={(e) => setDefaultSource(e.target.value as LeadWidgetRow["default_source"])}
              className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Accent color</label>
            <Input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-full" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Interest options shown to visitors (comma-separated, optional)
          </label>
          <Input
            value={interestOptionsText}
            onChange={(e) => setInterestOptionsText(e.target.value)}
            placeholder="e.g. Haircut, Facial, Spa"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Form is active (turn off to temporarily stop accepting new leads)
        </label>

        {error && <InlineError message={error} />}
        {saved && !error && <p className="text-sm text-success-600">Saved.</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save changes
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate embed key
          </Button>
        </div>
      </form>
    </div>
  );
}
