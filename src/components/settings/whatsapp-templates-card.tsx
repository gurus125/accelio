"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineError } from "@/components/inline-error";
import {
  setTemplateStatusManually,
  submitTemplatesToWhatsApp,
  syncTemplateStatuses,
  updateTemplateSettings,
} from "@/lib/templates/actions";
import {
  TEMPLATE_KEY_LABELS,
  TEMPLATE_KEYS,
  TEMPLATE_LANGUAGE_LABELS,
  TEMPLATE_LANGUAGES,
  type TemplateLanguage,
  type TemplateStatus,
} from "@/lib/templates/catalog";
import type { MessageTemplateRow } from "@/types/database";

const STATUS_BADGE: Record<TemplateStatus, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  approved: { label: "Approved", variant: "success" },
  submitted: { label: "In review", variant: "warning" },
  draft: { label: "Not submitted", variant: "muted" },
  rejected: { label: "Rejected", variant: "danger" },
  paused: { label: "Paused", variant: "danger" },
};

interface WhatsAppTemplatesCardProps {
  templates: MessageTemplateRow[];
  language: TemplateLanguage;
  discreet: boolean;
  whatsappConnected: boolean;
  hasBusinessAccountId: boolean;
}

/**
 * Settings -> WhatsApp templates (Milestone 2). WhatsApp only lets you
 * message someone who hasn't written to you in 24 hours with a template it
 * has approved. Here the owner picks the template language, turns discreet
 * mode on/off, submits the templates to WhatsApp and checks their status.
 */
export function WhatsAppTemplatesCard({
  templates,
  language: initialLanguage,
  discreet: initialDiscreet,
  whatsappConnected,
  hasBusinessAccountId,
}: WhatsAppTemplatesCardProps) {
  const router = useRouter();
  const [language, setLanguage] = React.useState<TemplateLanguage>(initialLanguage);
  const [discreet, setDiscreet] = React.useState(initialDiscreet);
  const [busy, setBusy] = React.useState<null | "save" | "submit" | "sync" | string>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const run = async (key: string, action: () => Promise<{ error?: string; message?: string }>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    const result = await action();
    setBusy(null);
    if (result.error) setError(result.error);
    else if (result.message) setNotice(result.message);
    router.refresh();
  };

  const settingsChanged = language !== initialLanguage || discreet !== initialDiscreet;
  const canTalkToMeta = whatsappConnected && hasBusinessAccountId;
  const approvedCount = templates.filter((t) => t.status === "approved").length;

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No templates yet. Apply database migration 0020 (see the README), then reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <InlineError message={error} />
      {notice && (
        <p role="status" className="rounded-lg bg-success-50 p-3 text-sm text-success-600">
          {notice}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        WhatsApp lets you send your own words only to customers who messaged you in the last 24 hours. Everyone else
        gets one of these templates, once WhatsApp approves it. <span className="font-medium">{approvedCount}</span> of{" "}
        {templates.length} approved.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Message language <span className="font-normal text-muted-foreground">/ मैसेज की भाषा</span>
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as TemplateLanguage)}
            className="h-11 rounded-lg border border-border bg-white px-3 text-sm"
          >
            {TEMPLATE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {TEMPLATE_LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">If this language isn&apos;t approved yet, English is used.</span>
        </label>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
            checked={discreet}
            onChange={(e) => setDiscreet(e.target.checked)}
          />
          <span>
            <span className="font-medium">Discreet reminders</span>
            <span className="block text-muted-foreground">
              Reminders never name the service (e.g. waxing, threading). Recommended for parlours. / रिमाइंडर में सर्विस
              का नाम नहीं आएगा।
            </span>
          </span>
        </label>
      </div>

      {settingsChanged && (
        <Button
          className="min-h-11"
          onClick={() => run("save", () => updateTemplateSettings({ language, discreet }))}
          disabled={busy !== null}
        >
          {busy === "save" ? "Saving..." : "Save"}
        </Button>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button className="min-h-11" onClick={() => run("submit", submitTemplatesToWhatsApp)} disabled={busy !== null || !canTalkToMeta}>
          <Send className="h-4 w-4" />
          {busy === "submit" ? "Submitting..." : "Submit to WhatsApp for approval"}
        </Button>
        <Button
          className="min-h-11"
          variant="secondary"
          onClick={() => run("sync", syncTemplateStatuses)}
          disabled={busy !== null || !canTalkToMeta}
        >
          <RefreshCw className="h-4 w-4" />
          {busy === "sync" ? "Checking..." : "Refresh status"}
        </Button>
      </div>
      {!canTalkToMeta && (
        <p className="text-xs text-muted-foreground">
          Connect WhatsApp above, including your WhatsApp Business Account ID, to submit templates and check their status.
          You can also create them yourself in WhatsApp Manager using the exact name and text below, then mark them
          approved here.
        </p>
      )}

      <div className="space-y-2">
        {TEMPLATE_KEYS.map((key) => {
          const group = templates.filter((t) => t.key === key);
          if (group.length === 0) return null;
          return (
            <details key={key} className="rounded-xl border border-border">
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium">
                {TEMPLATE_KEY_LABELS[key]}
                <span className="flex flex-wrap gap-1">
                  {group.map((t) => (
                    <Badge key={t.id} variant={STATUS_BADGE[t.status].variant}>
                      {t.language === "hi" ? "HI" : t.language === "hinglish" ? "Hinglish" : "EN"}
                      {t.variant === "discreet" ? " · discreet" : ""}: {STATUS_BADGE[t.status].label}
                    </Badge>
                  ))}
                </span>
              </summary>
              <ul className="space-y-3 border-t border-border p-3">
                {group.map((t) => (
                  <li key={t.id} className="space-y-1.5 text-sm">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{t.name}</code>
                      <span>
                        {TEMPLATE_LANGUAGE_LABELS[t.language]} (WhatsApp language “{t.meta_language_code}”) ·{" "}
                        {t.category === "utility" ? "Utility" : "Marketing"}
                        {t.variant === "discreet" ? " · discreet" : ""}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5">{t.body}</p>
                    {t.rejection_reason && <p className="text-xs text-danger-600">WhatsApp said: {t.rejection_reason}</p>}
                    <div className="flex flex-wrap gap-2">
                      {t.status !== "approved" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          disabled={busy !== null}
                          onClick={() => run(t.id, () => setTemplateStatusManually(t.id, "approved"))}
                        >
                          Mark approved (created in WhatsApp Manager)
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          disabled={busy !== null}
                          onClick={() => run(t.id, () => setTemplateStatusManually(t.id, "paused"))}
                        >
                          Stop using this template
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
