"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WhatsappBubble } from "@/components/whatsapp-bubble";
import { ToneSelector } from "@/components/ai/tone-selector";
import { LanguageSelector } from "@/components/ai/language-selector";
import { InlineError } from "@/components/inline-error";
import { cn } from "@/lib/utils";
import type { MessageLanguage, MessageTone } from "@/lib/ai/types";
import {
  createCampaign,
  addRecipients,
  removeRecipient,
  setCampaignMessage,
  generateCampaignAiMessage,
  approveCampaign,
  getRecipientsPreview,
} from "@/lib/campaigns/actions";
import type { CampaignRecipientWithCustomer, CampaignType } from "@/lib/campaigns/types";
import { CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPE_DESCRIPTIONS } from "@/lib/campaigns/types";
import { personalizeMessage } from "@/lib/campaigns/personalize";

type Step = 1 | 2 | 3 | 4;

const AUDIENCE_ORDER: CampaignType[] = [
  "inactive_customers",
  "due_for_return",
  "high_value_inactive",
  "service_reminder",
  "follow_up",
  "custom",
];

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

export function NewCampaignWizard({
  audienceCounts,
  customers,
  businessName,
}: {
  audienceCounts: Record<CampaignType, number>;
  customers: CustomerOption[];
  businessName: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [campaignType, setCampaignType] = React.useState<CampaignType>("inactive_customers");
  const [campaignId, setCampaignId] = React.useState<string | null>(null);

  const [recipients, setRecipients] = React.useState<CampaignRecipientWithCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = React.useState("");

  const [tone, setTone] = React.useState<MessageTone>("friendly");
  const [language, setLanguage] = React.useState<MessageLanguage>("english");
  const [message, setMessage] = React.useState("");
  const [generating, setGenerating] = React.useState(false);

  const refreshRecipients = React.useCallback(async (id: string) => {
    const data = await getRecipientsPreview(id);
    setRecipients(data);
  }, []);

  const handleCreateCampaign = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Give this campaign a name.");
      return;
    }
    setSaving(true);
    const result = await createCampaign({ name, campaignType });
    setSaving(false);
    if (result.error || !result.id) {
      setError(result.error ?? "Couldn't create the campaign.");
      return;
    }
    setCampaignId(result.id);
    await refreshRecipients(result.id);
    setStep(2);
  };

  const handleAddCustomer = async (customerId: string) => {
    if (!campaignId) return;
    const result = await addRecipients(campaignId, [customerId]);
    if (result.error) {
      setError(result.error);
      return;
    }
    await refreshRecipients(campaignId);
  };

  const handleRemove = async (recipientId: string) => {
    if (!campaignId) return;
    const result = await removeRecipient(campaignId, recipientId);
    if (result.error) {
      setError(result.error);
      return;
    }
    await refreshRecipients(campaignId);
  };

  const handleGenerate = async () => {
    if (!campaignId) return;
    setGenerating(true);
    setError(null);
    const result = await generateCampaignAiMessage(campaignId, tone, language);
    setGenerating(false);
    if (result.error || !result.message) {
      setError(result.error ?? "Couldn't generate a message.");
      return;
    }
    setMessage(result.message);
  };

  const handleSaveMessageAndContinue = async () => {
    if (!campaignId) return;
    setError(null);
    if (!message.trim()) {
      setError("Write or generate a message first.");
      return;
    }
    setSaving(true);
    const result = await setCampaignMessage(campaignId, { messageTemplate: message, tone, language });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setStep(4);
  };

  const handleApprove = async () => {
    if (!campaignId) return;
    setSaving(true);
    setError(null);
    const result = await approveCampaign(campaignId);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/campaigns/${campaignId}`);
  };

  const existingRecipientIds = new Set(recipients.map((r) => r.customer_id));
  const filteredCustomers = customers.filter(
    (c) =>
      !existingRecipientIds.has(c.id) &&
      (customerSearch.trim() === "" || c.name.toLowerCase().includes(customerSearch.trim().toLowerCase()))
  );

  const previewMessage = message
    ? personalizeMessage(message, { customerName: "Rahul", businessName })
    : "";

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-8">
      <button
        onClick={() => (step === 1 ? router.push("/campaigns") : setStep((s) => (s - 1) as Step))}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={cn("h-1.5 flex-1 rounded-full", step >= s ? "bg-brand-500" : "bg-border")} />
        ))}
      </div>

      <InlineError message={error} />

      {step === 1 && (
        <div className="animate-fade-in space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Who do you want to reach?</h2>
            <p className="text-sm text-muted-foreground">Pick a segment, or choose your own customers.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="campaign-name" className="text-sm font-medium">
              Campaign name
            </label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Inactive customers - September"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {AUDIENCE_ORDER.map((type) => (
              <button
                key={type}
                onClick={() => setCampaignType(type)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border bg-white p-4 text-left transition-all",
                  campaignType === type ? "border-brand-500 ring-2 ring-brand-100" : "border-border transition-all hover:border-brand-200 hover:-translate-y-0.5"
                )}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-600" />
                  <p className="text-sm font-medium">{CAMPAIGN_TYPE_LABELS[type]}</p>
                </div>
                <p className="text-xs text-muted-foreground">{CAMPAIGN_TYPE_DESCRIPTIONS[type]}</p>
                <p className="text-xs font-medium text-foreground">{audienceCounts[type]} customers</p>
              </button>
            ))}
          </div>
          <Button className="w-full" size="lg" onClick={handleCreateCampaign} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
          </Button>
        </div>
      )}

      {step === 2 && campaignId && (
        <div className="animate-fade-in space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Review your audience</h2>
            <p className="text-sm text-muted-foreground">
              {recipients.length} customer{recipients.length === 1 ? "" : "s"} will receive this campaign.
            </p>
          </div>

          {recipients.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No eligible customers for this segment right now.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-white">
              {recipients.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.customerPhone}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(r.id)}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-danger-600"
                    aria-label={`Remove ${r.customerName}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {campaignType === "custom" && (
            <div className="space-y-2">
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customers to add..."
              />
              {customerSearch.trim() !== "" && (
                <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-white">
                  {filteredCustomers.slice(0, 20).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                      <span className="truncate">{c.name}</span>
                      <Button size="sm" variant="secondary" onClick={() => handleAddCustomer(c.id)}>
                        Add
                      </Button>
                    </li>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <li className="p-2.5 text-sm text-muted-foreground">No matching customers.</li>
                  )}
                </ul>
              )}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={() => setStep(3)} disabled={recipients.length === 0}>
            Continue
          </Button>
        </div>
      )}

      {step === 3 && campaignId && (
        <div className="animate-fade-in space-y-5">
          <div>
            <h2 className="text-lg font-semibold">What do you want to say?</h2>
            <p className="text-sm text-muted-foreground">
              Write your own message, or let Reelo draft one. Use {"{{customer_name}}"} to personalize it — Reelo
              fills it in for each customer automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <ToneSelector value={tone} onChange={setTone} disabled={generating} />
            <LanguageSelector value={language} onChange={setLanguage} disabled={generating} />
            <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generate with AI
            </Button>
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            aria-label="Campaign message"
            placeholder="Hi {{customer_name}}, it's been a while since your last visit..."
          />
          <Button className="w-full" size="lg" onClick={handleSaveMessageAndContinue} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
          </Button>
        </div>
      )}

      {step === 4 && campaignId && (
        <div className="animate-fade-in space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Review &amp; approve</h2>
            <p className="text-sm text-muted-foreground">
              This is what {recipients.length} customer{recipients.length === 1 ? "" : "s"} will see. Nothing is sent
              yet — approving just makes this campaign ready to send.
            </p>
          </div>
          <WhatsappBubble message={previewMessage} />
          <div className="rounded-xl border border-border bg-white p-4 text-sm">
            <p className="flex justify-between py-1">
              <span className="text-muted-foreground">Campaign</span>
              <span className="font-medium">{name}</span>
            </p>
            <p className="flex justify-between py-1">
              <span className="text-muted-foreground">Audience</span>
              <span className="font-medium">{CAMPAIGN_TYPE_LABELS[campaignType]}</span>
            </p>
            <p className="flex justify-between py-1">
              <span className="text-muted-foreground">Recipients</span>
              <span className="font-medium">{recipients.length}</span>
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={handleApprove} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve campaign"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You&apos;ll send it from the campaign page next, with one more confirmation.
          </p>
        </div>
      )}
    </div>
  );
}
