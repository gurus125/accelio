"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InlineError } from "@/components/inline-error";
import { createAutomationAction, activateAutomationAction } from "@/lib/automations/actions";
import {
  AUTOMATION_TYPE_LABELS,
  AUTOMATION_TYPE_TRIGGER_DESCRIPTIONS,
  describeAutomationInPlainLanguage,
  describeDelayInPlainLanguage,
} from "@/lib/automations/labels";
import { AUTOMATION_DELAY_OPTIONS_MINUTES } from "@/lib/automations/constants";
import type { AutomationActionType, AutomationType } from "@/lib/automations/types";

const AUTOMATION_TYPES: AutomationType[] = ["new_lead_followup", "due_for_return", "follow_up_reminder", "service_reminder", "recurring_schedule"];

const DEFAULT_TEMPLATES: Record<AutomationType, string> = {
  new_lead_followup: "Hi {{lead_name}}, thanks for reaching out to {{business_name}}! We'll get back to you shortly with details on {{interest}}.",
  due_for_return: "Hi {{customer_name}}, it's been a while since your last visit to {{business_name}} — we'd love to see you again soon!",
  follow_up_reminder: "Hi {{customer_name}}, just checking in from {{business_name}} — let us know if you need anything.",
  service_reminder: "Hi {{customer_name}}, this is a friendly reminder from {{business_name}} that you may be due for your next service.",
  recurring_schedule: "Hi {{customer_name}}, just a reminder from {{business_name}} that {{reminder_label}} is due today.",
};

type WizardStep = 1 | 2 | 3 | 4;

/**
 * The Phase 14 guided create flow — four short steps, never a canvas or a
 * branching builder. Step 4 is the mandated preview + explicit
 * confirmation before anything can actually go live (spec steps 25-26):
 * creating the automation here only ever leaves it in `draft` — a second,
 * separate "Activate" action (with its own safety copy) is what turns it
 * on.
 */
export function NewAutomationWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<WizardStep>(1);
  const [automationType, setAutomationType] = React.useState<AutomationType | null>(null);
  const [actionType, setActionType] = React.useState<AutomationActionType>("send_whatsapp");
  const [delayMinutes, setDelayMinutes] = React.useState<number>(10);
  const [name, setName] = React.useState("");
  const [messageTemplate, setMessageTemplate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [activateNow, setActivateNow] = React.useState(false);

  React.useEffect(() => {
    if (automationType && !messageTemplate) {
      setMessageTemplate(DEFAULT_TEMPLATES[automationType]);
      setName(`${AUTOMATION_TYPE_LABELS[automationType]} automation`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationType]);

  const handleCreate = async () => {
    if (!automationType) return;
    setSaving(true);
    setError(null);

    const created = await createAutomationAction({
      name: name.trim() || AUTOMATION_TYPE_LABELS[automationType],
      automationType,
      actionType,
      delayMinutes,
      messageTemplate: actionType === "send_whatsapp" ? messageTemplate : undefined,
    });

    if (created.error || !created.automation) {
      setSaving(false);
      setError(created.error ?? "Something went wrong creating this automation.");
      return;
    }

    if (activateNow) {
      const activated = await activateAutomationAction(created.automation.id);
      if (activated.error) {
        setSaving(false);
        router.push(`/automations/${created.automation.id}`);
        return;
      }
    }

    setSaving(false);
    router.push(`/automations/${created.automation.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-8">
      <InlineError message={error} />

      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {[1, 2, 3, 4].map((s) => (
          <React.Fragment key={s}>
            <span className={s <= step ? "text-brand-600" : ""}>Step {s}</span>
            {s < 4 && <span>-</span>}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">When should this run?</h2>
          <p className="text-sm text-muted-foreground">Pick one of these safe, predefined situations.</p>
          <div className="space-y-2">
            {AUTOMATION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAutomationType(type)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  automationType === type ? "border-brand-500 bg-brand-50" : "border-border transition-colors hover:bg-muted"
                }`}
              >
                <p className="font-medium">{AUTOMATION_TYPE_LABELS[type]}</p>
                <p className="mt-1 text-sm text-muted-foreground">{AUTOMATION_TYPE_TRIGGER_DESCRIPTIONS[type]}</p>
              </button>
            ))}
          </div>
          <Button size="sm" disabled={!automationType} onClick={() => setStep(2)}>
            Continue
          </Button>
        </Card>
      )}

      {step === 2 && automationType && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">What should Reelo do?</h2>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setActionType("send_whatsapp")}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                actionType === "send_whatsapp" ? "border-brand-500 bg-brand-50" : "border-border transition-colors hover:bg-muted"
              }`}
            >
              <p className="font-medium">Send an approved WhatsApp message automatically</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Reelo sends the exact message you approve below, once every safety check passes.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActionType("create_recommendation")}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                actionType === "create_recommendation" ? "border-brand-500 bg-brand-50" : "border-border transition-colors hover:bg-muted"
              }`}
            >
              <p className="font-medium">Just show me a recommendation to review and send myself</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing is sent automatically — you&apos;ll see this on your dashboard to act on.
              </p>
            </button>
          </div>
          {actionType === "send_whatsapp" && (
            <div className="space-y-1.5">
              <label htmlFor="message-template" className="text-sm font-medium">
                Approved message
              </label>
              <Textarea
                id="message-template"
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                You can use {"{{customer_name}}"}, {"{{lead_name}}"}, {"{{business_name}}"}, {"{{interest}}"} and{" "}
                {"{{reminder_label}}"}.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button size="sm" onClick={() => setStep(3)}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && automationType && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">How long should Reelo wait?</h2>
          <div className="space-y-2">
            {AUTOMATION_DELAY_OPTIONS_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setDelayMinutes(minutes)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  delayMinutes === minutes ? "border-brand-500 bg-brand-50" : "border-border transition-colors hover:bg-muted"
                }`}
              >
                {minutes === 0 ? "Right away" : describeDelayInPlainLanguage(minutes)}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="automation-name" className="text-sm font-medium">
              Name (just for you)
            </label>
            <Input id="automation-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button size="sm" onClick={() => setStep(4)}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && automationType && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">Review before you create it</h2>
          <p className="text-sm">
            {describeAutomationInPlainLanguage({ automationType, actionType, delayMinutes })}
          </p>
          {actionType === "send_whatsapp" && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">{messageTemplate}</div>
          )}
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>- Reelo will only contact eligible customers or leads.</li>
            <li>- It respects your communication rules, cooldowns, and daily limits.</li>
            <li>- You can pause or stop it at any time — including instantly, from Settings.</li>
            <li>- If someone replies, Reelo will never auto-reply for you — you&apos;ll be told to follow up yourself.</li>
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
            Turn this automation on now (otherwise it&apos;s saved as a draft)
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep(3)} disabled={saving}>
              Back
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : activateNow ? "Create and activate" : "Create as draft"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
