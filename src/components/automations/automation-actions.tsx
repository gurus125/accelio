"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/inline-error";
import {
  activateAutomationAction,
  archiveAutomationAction,
  pauseAutomationAction,
  sendAutomationTestMessage,
} from "@/lib/automations/actions";
import type { AutomationRow } from "@/lib/automations/types";

/**
 * The automation detail page's action bar. Activating always goes through
 * the mandated preview + explicit confirmation modal (spec steps 25-26) —
 * there is no path that turns an automation on without this. Pausing and
 * archiving are single clicks (they only ever make an automation do LESS),
 * matching how the campaign detail page treats its own lower-risk actions.
 */
export function AutomationActions({ automation }: { automation: AutomationRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingActivate, setConfirmingActivate] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    const result = await activateAutomationAction(automation.id);
    setBusy(false);
    setConfirmingActivate(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handlePause = async () => {
    setBusy(true);
    setError(null);
    const result = await pauseAutomationAction(automation.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleArchive = async () => {
    setBusy(true);
    setError(null);
    const result = await archiveAutomationAction(automation.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleTest = async () => {
    setBusy(true);
    setError(null);
    setTestResult(null);
    const result = await sendAutomationTestMessage(automation.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTestResult("Test message sent to your own WhatsApp number.");
  };

  return (
    <div className="space-y-3">
      <InlineError message={error} />
      {testResult && (
        <p role="status" className="text-sm text-success-600">
          {testResult}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(automation.status === "draft" || automation.status === "paused") && (
          <Button size="sm" onClick={() => setConfirmingActivate(true)} disabled={busy}>
            {automation.status === "paused" ? "Resume" : "Activate"}
          </Button>
        )}
        {automation.status === "active" && (
          <Button size="sm" variant="secondary" onClick={handlePause} disabled={busy}>
            Pause
          </Button>
        )}
        {automation.action_type === "send_whatsapp" && (
          <Button size="sm" variant="secondary" onClick={handleTest} disabled={busy}>
            Send test message
          </Button>
        )}
        {automation.status !== "archived" && (
          <Button size="sm" variant="ghost" onClick={handleArchive} disabled={busy}>
            Archive
          </Button>
        )}
      </div>

      <Modal
        open={confirmingActivate}
        onClose={() => setConfirmingActivate(false)}
        title="Turn this automation on?"
        description="Reelo will start acting on it automatically from now on."
      >
        <div className="space-y-4">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              You&apos;re enabling automatic WhatsApp follow-ups. Reelo will only contact eligible customers or leads
              and will respect your communication rules, cooldowns and daily limits.
            </li>
            <li>- If someone replies, you&apos;ll be told to follow up yourself — Reelo never auto-replies.</li>
            <li>- You can pause this any time, or stop everything at once from Settings -&gt; Automations.</li>
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirmingActivate(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleActivate} disabled={busy}>
              {busy ? "Activating..." : "Activate automation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
