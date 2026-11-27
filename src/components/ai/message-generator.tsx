"use client";

import * as React from "react";
import { Loader2, Sparkles, RefreshCw, Check, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { WhatsappBubble } from "@/components/whatsapp-bubble";
import { ToneSelector } from "@/components/ai/tone-selector";
import { LanguageSelector } from "@/components/ai/language-selector";
import type { MessageLanguage, MessageTone } from "@/lib/ai/types";
import type { MessageRow } from "@/lib/whatsapp/types";

interface MessageGeneratorProps {
  /** Exactly one of customerId/leadId — this component works for both a
   * customer's opportunity (Phase 7) and a website lead (Phase 13),
   * reusing the same AI generation + WhatsApp send flow for either rather
   * than existing as two components. */
  customerId?: string;
  leadId?: string;
  customerName: string;
  /** Only meaningful for a customer opportunity — omitted for a lead. */
  opportunityType?: string;
  /** Real, business-scoped WhatsApp connection state, decided server-side —
   * never assumed true just because a message was generated. */
  whatsappConnected: boolean;
  /** Formatted destination number (e.g. "+91 98765 43210"), or null when
   * the recipient's stored phone couldn't be confidently normalized. */
  customerPhoneDisplay: string | null;
}

type Status = "idle" | "loading" | "generated" | "edited" | "ready" | "error";
type SendState = "idle" | "previewing" | "confirming" | "sending" | "sent" | "error";

interface GenerateResponse {
  ok: boolean;
  data?: { message: string; tone: MessageTone; language: MessageLanguage };
  error?: string;
}

interface SendResponse {
  ok: boolean;
  data?: MessageRow;
  error?: string;
  /** Milestone 2 — dry-run preview of exactly what would be sent. */
  preview?: { mode: "freeform" | "template"; text: string; note: string | null };
}

const FALLBACK_GENERATE_ERROR = "We couldn't generate a message right now. Please try again.";
const FALLBACK_SEND_ERROR = "Message couldn't be sent.";

/**
 * The whole AI message-generation + WhatsApp-send experience for one
 * customer's opportunity: pick a tone/language, generate, review, edit,
 * mark ready, then explicitly send. Deliberately small and inline rather
 * than a chatbot-style interface.
 *
 * Nothing here calls the AI until "Generate message" is clicked, and
 * nothing here sends a WhatsApp message until the owner explicitly
 * confirms in the "Send message?" dialog — never on generation, mount,
 * render, or page load.
 */
export function MessageGenerator({
  customerId,
  leadId,
  customerName,
  opportunityType,
  whatsappConnected,
  customerPhoneDisplay,
}: MessageGeneratorProps) {
  const [tone, setTone] = React.useState<MessageTone>("friendly");
  const [language, setLanguage] = React.useState<MessageLanguage>("english");
  const [status, setStatus] = React.useState<Status>("idle");
  const [message, setMessage] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [sendState, setSendState] = React.useState<SendState>("idle");
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sentMessage, setSentMessage] = React.useState<MessageRow | null>(null);
  const [preview, setPreview] = React.useState<SendResponse["preview"] | null>(null);

  // Guards against a stale response landing after a newer request (e.g. a
  // fast double-click on Regenerate) from overwriting the latest one.
  const requestIdRef = React.useRef(0);
  const isBusy = status === "loading";
  const isSending = sendState === "sending";

  const generate = React.useCallback(async () => {
    if (isBusy) return; // no duplicate concurrent requests
    const thisRequestId = ++requestIdRef.current;
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadId ? { leadId, tone, language } : { customerId, tone, language }),
      });

      let json: GenerateResponse;
      try {
        json = (await response.json()) as GenerateResponse;
      } catch {
        json = { ok: false };
      }

      if (requestIdRef.current !== thisRequestId) return; // superseded

      if (!response.ok || !json.ok || !json.data) {
        setStatus("error");
        setError(json.error ?? FALLBACK_GENERATE_ERROR);
        return;
      }

      setMessage(json.data.message);
      setDraft(json.data.message);
      setStatus("generated");
    } catch {
      if (requestIdRef.current !== thisRequestId) return;
      setStatus("error");
      setError(FALLBACK_GENERATE_ERROR);
    }
  }, [customerId, leadId, tone, language, isBusy]);

  const handleSaveEdit = () => {
    setMessage(draft);
    setStatus("edited");
  };

  const handleContinue = () => {
    setMessage(draft);
    setStatus("ready");
  };

  const sendBody = React.useCallback(
    (extra: Record<string, unknown> = {}) =>
      JSON.stringify(
        leadId ? { leadId, content: message, ...extra } : { customerId, content: message, opportunityType, ...extra }
      ),
    [leadId, customerId, message, opportunityType]
  );

  /** Milestone 2 — ask the server what will ACTUALLY be sent (free-form vs
   * the approved template) before the owner confirms. */
  const handleOpenConfirm = async () => {
    setSendState("previewing");
    setSendError(null);
    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sendBody({ dryRun: true }),
      });
      const json = (await response.json().catch(() => ({ ok: false }))) as SendResponse;
      if (!response.ok || !json.ok || !json.preview) {
        setSendState("error");
        setSendError(json.error ?? FALLBACK_SEND_ERROR);
        return;
      }
      setPreview(json.preview);
      setSendState("confirming");
    } catch {
      setSendState("error");
      setSendError(FALLBACK_SEND_ERROR);
    }
  };

  const handleSend = async () => {
    if (isSending) return; // guards against a double-click while a send is in flight
    setSendState("sending");
    setSendError(null);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sendBody(),
      });

      let json: SendResponse;
      try {
        json = (await response.json()) as SendResponse;
      } catch {
        json = { ok: false };
      }

      if (!response.ok || !json.ok) {
        setSendState("error");
        setSendError(json.error ?? FALLBACK_SEND_ERROR);
        return;
      }

      setSentMessage(json.data ?? null);
      setSendState("sent");
    } catch {
      setSendState("error");
      setSendError(FALLBACK_SEND_ERROR);
    }
  };

  const showComposer = status === "generated" || status === "edited" || status === "ready";
  const isReady = status === "ready";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <ToneSelector value={tone} onChange={setTone} disabled={isBusy || isReady} />
        <LanguageSelector value={language} onChange={setLanguage} disabled={isBusy || isReady} />
      </div>

      {status === "idle" && (
        <Button onClick={generate}>
          <Sparkles className="h-4 w-4" />
          Generate message
        </Button>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Writing message...
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-danger-600">{error}</p>
          <Button size="sm" variant="secondary" onClick={generate}>
            Try again
          </Button>
        </div>
      )}

      {showComposer && (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Message preview</p>
            <WhatsappBubble message={message} />
          </div>

          {!isReady && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Edit message</p>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                aria-label="Edit message"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!isReady && draft !== message && (
              <Button size="sm" onClick={handleSaveEdit}>
                Save changes
              </Button>
            )}
            {!isReady && (
              <Button size="sm" variant="secondary" onClick={generate} disabled={isBusy}>
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            )}
            {!isReady && (
              <Button size="sm" variant="success" onClick={handleContinue}>
                <Check className="h-3.5 w-3.5" />
                Continue
              </Button>
            )}
          </div>

          {isReady && sendState !== "sent" && (
            <div className="space-y-2 border-t border-border pt-3">
              {!whatsappConnected ? (
                <p className="text-sm text-muted-foreground">Connect WhatsApp to send this message.</p>
              ) : !customerPhoneDisplay ? (
                <p className="text-sm text-danger-600">This customer has an invalid WhatsApp number.</p>
              ) : (
                <>
                  <Button size="sm" onClick={handleOpenConfirm} disabled={isSending || sendState === "previewing"}>
                    {sendState === "previewing" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    Send on WhatsApp
                  </Button>
                  {sendState === "error" && sendError && <p className="text-sm text-danger-600">{sendError}</p>}
                </>
              )}
            </div>
          )}

          {sendState === "sent" && (
            <div className="flex items-center gap-1.5 border-t border-border pt-3 text-sm text-success-600">
              <Check className="h-4 w-4" />
              Message sent
              {sentMessage?.sent_at && (
                <span className="text-muted-foreground">
                  ·{" "}
                  {new Date(sentMessage.sent_at).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <Modal
        open={sendState === "confirming" || isSending}
        onClose={() => {
          if (!isSending) setSendState("idle");
        }}
        title={`Send this message to ${customerName}?`}
      >
        <div className="space-y-4">
          <WhatsappBubble message={preview?.text ?? message} />
          {preview?.note && (
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              {preview.mode === "template" ? "Approved template: " : ""}
              {preview.note}
            </p>
          )}
          {customerPhoneDisplay && (
            <p className="text-sm text-muted-foreground">
              To: <span className="font-medium text-foreground">{customerPhoneDisplay}</span>
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSendState("idle")}
              disabled={isSending}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageCircle className="h-3.5 w-3.5" />
                  Send message
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
