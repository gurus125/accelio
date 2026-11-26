import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, Globe, MessageSquareText } from "lucide-react";
import { TopBar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { LeadStatusActions } from "@/components/leads/lead-status-actions";
import { CommunicationHistory } from "@/components/customers/communication-history";
import { MessageGenerator } from "@/components/ai/message-generator";
import { describeLeadSource } from "@/lib/leads/labels";
import { isSupabaseConfigured } from "@/lib/config";
import { getBusinessForCurrentUser } from "@/lib/business/queries";
import { getLead } from "@/lib/leads/queries";
import { getCommunicationTimelineForLead } from "@/lib/whatsapp/queries";
import { getWhatsAppConnection } from "@/lib/whatsapp/queries";
import { isWhatsAppEnvConfigured } from "@/lib/whatsapp/config";
import { normalizePhoneForWhatsApp, formatNormalizedPhoneForDisplay } from "@/lib/whatsapp/phone";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  if (!isSupabaseConfigured) notFound();

  const business = await getBusinessForCurrentUser();
  if (!business) notFound();

  const lead = await getLead(business.id, params.id);
  if (!lead) notFound();

  const [timeline, connection] = await Promise.all([
    getCommunicationTimelineForLead(lead.id),
    getWhatsAppConnection(business.id),
  ]);

  const whatsappConnected = Boolean(isWhatsAppEnvConfigured && connection?.connection_status === "connected");
  const normalizedPhone = lead.phone ? normalizePhoneForWhatsApp(lead.phone) : null;
  const phoneDisplay = normalizedPhone ? formatNormalizedPhoneForDisplay(normalizedPhone) : null;
  const canGenerateMessage = lead.status !== "converted" && lead.status !== "lost";

  return (
    <>
      <TopBar
        title={lead.name || "Unnamed lead"}
        subtitle={
          <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to leads
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 sm:p-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Avatar name={lead.name || lead.phone || "Lead"} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{lead.name || "Unnamed lead"}</h2>
                  <LeadStatusBadge status={lead.status} />
                  {lead.customer_id && (
                    <Link href={`/customers/${lead.customer_id}`}>
                      <Badge variant="success">Linked customer</Badge>
                    </Link>
                  )}
                </div>
                <div className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                  {phoneDisplay && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> {phoneDisplay}
                    </p>
                  )}
                  {lead.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> {lead.email}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> {describeLeadSource(lead.source)}
                    {lead.source_url && (
                      <span className="truncate text-xs">
                        ({lead.source_url})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Interested in</p>
                <p className="mt-0.5 text-sm font-medium">{lead.interest || "Not specified"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Captured</p>
                <p className="mt-0.5 text-sm font-medium">{formatDateTime(lead.captured_at)}</p>
              </div>
              {lead.message && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Message left</p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm">
                    <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {lead.message}
                  </p>
                </div>
              )}
              {lead.consent_status === "given" && lead.consent_text && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Consent given</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    &ldquo;{lead.consent_text}&rdquo;
                    {lead.consent_given_at && ` — ${formatDateTime(lead.consent_given_at)}`}
                  </p>
                </div>
              )}
              {lead.converted_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Converted</p>
                  <p className="mt-0.5 text-sm font-medium">{formatDateTime(lead.converted_at)}</p>
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <LeadStatusActions leadId={lead.id} status={lead.status} canConvert={Boolean(normalizedPhone)} />
            </div>
          </CardContent>
        </Card>

        {canGenerateMessage && (
          <Card>
            <CardHeader>
              <CardTitle>Follow up</CardTitle>
            </CardHeader>
            <CardContent>
              <MessageGenerator
                leadId={lead.id}
                customerName={lead.name || "there"}
                whatsappConnected={whatsappConnected}
                customerPhoneDisplay={phoneDisplay}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Communication history</CardTitle>
          </CardHeader>
          <CardContent>
            <CommunicationHistory
              timeline={timeline}
              whatsappDeepLink={normalizedPhone ? `https://wa.me/${normalizedPhone}` : null}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
