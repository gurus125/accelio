import { Send, Check, CheckCheck, XCircle, Loader2, MessageCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageStatus, TimelineEntry } from "@/lib/whatsapp/types";

const OUTBOUND_ICON: Record<MessageStatus, typeof Send> = {
  draft: Send,
  approved: Send,
  sending: Loader2,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: XCircle,
};

/** Plain-language labels only — no "provider message id" / "webhook
 * payload" style internals ever reach this UI (see the Phase 9 spec's UX
 * rules). */
const OUTBOUND_LABEL: Record<MessageStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sending: "Sending...",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Couldn't send",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Real communication history — every row is a genuine `messages` (outbound)
 * or `customer_messages` (inbound) record, merged and time-ordered by
 * `getCommunicationTimelineForCustomer`. Deliberately simple: this is a
 * status list, not a WhatsApp chat client clone (see the Phase 9 spec).
 */
export function CommunicationHistory({
  timeline,
  whatsappDeepLink,
}: {
  timeline: TimelineEntry[];
  whatsappDeepLink: string | null;
}) {
  const hasReply = timeline.some((entry) => entry.direction === "inbound");

  return (
    <div className="space-y-3">
      {hasReply && (
        <div className="flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
          <MessageCircle className="h-4 w-4" />
          Customer replied
        </div>
      )}

      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages sent yet.</p>
      ) : (
        <ul className="space-y-3">
          {timeline.map((entry) => {
            if (entry.direction === "outbound") {
              const message = entry.message;
              const Icon = OUTBOUND_ICON[message.status];
              return (
                <li key={`out-${message.id}`} className="flex items-start gap-3 text-sm">
                  <div
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      message.status === "failed" ? "bg-danger-50" : "bg-muted"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        (message.status === "sent" || message.status === "delivered") && "text-success-600",
                        message.status === "read" && "text-brand-600",
                        message.status === "failed" && "text-danger-600",
                        (message.status === "draft" || message.status === "approved") && "text-muted-foreground",
                        message.status === "sending" && "animate-spin text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">You</p>
                    <p className="truncate font-medium">
                      {message.content ?? (message.template_name ? `Template: ${message.template_name}` : "Message")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {OUTBOUND_LABEL[message.status]} · {formatTimestamp(entry.timestamp)}
                    </p>
                    {message.status === "failed" && message.error_message && (
                      <p className="mt-0.5 text-xs text-danger-600">
                        WhatsApp could not deliver this message.
                      </p>
                    )}
                  </div>
                </li>
              );
            }

            const message = entry.message;
            return (
              <li key={`in-${message.id}`} className="flex items-start gap-3 text-sm">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <MessageCircle className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">Customer replied</p>
                  <p className="truncate font-medium">{message.content ?? "(non-text message)"}</p>
                  <p className="text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {whatsappDeepLink && (
        <a
          href={whatsappDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Reply on WhatsApp
        </a>
      )}
    </div>
  );
}
