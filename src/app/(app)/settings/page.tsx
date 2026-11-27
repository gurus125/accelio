import { FileText, Store, MessageCircle, Database, Bell, CreditCard, Server, UserCircle, Wrench, Globe, Zap, CalendarClock } from "lucide-react";
import { headers } from "next/headers";
import { TopBar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { BUSINESS } from "@/lib/mock-data";
import { SupabaseStatus } from "@/components/supabase-status";
import { LogoutButton } from "@/components/auth/logout-button";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { SeedDemoDataButton } from "@/components/settings/seed-demo-data-button";
import { WhatsAppConnectionCard } from "@/components/settings/whatsapp-connection-card";
import { WhatsAppTemplatesCard } from "@/components/settings/whatsapp-templates-card";
import { listMessageTemplates } from "@/lib/templates/queries";
import { businessTemplateLanguage } from "@/lib/templates/prepare";
import { LeadWidgetCard } from "@/components/settings/lead-widget-card";
import { AutomationsPauseAllCard } from "@/components/settings/automations-pause-all-card";
import { ServiceBaselinesCard } from "@/components/settings/service-baselines-card";
import { ensureWidgetForBusiness } from "@/lib/leads/queries";
import { listServiceBaselines, listDistinctServiceNamesForBusiness } from "@/lib/opportunities/baselines";
import { listAutomationsForBusiness } from "@/lib/automations/queries";
import { createClient } from "@/lib/supabase/server";
import { isDevelopment, isSupabaseConfigured } from "@/lib/config";
import { redirect } from "next/navigation";
import { getBusinessForCurrentUser, getCurrentMembership } from "@/lib/business/queries";
import { getWhatsAppConnection } from "@/lib/whatsapp/queries";
import { isWhatsAppEnvConfigured } from "@/lib/whatsapp/config";

export default async function SettingsPage() {
  let email: string | undefined;

  if (isSupabaseConfigured) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email;

    // Phase 15 — business settings (WhatsApp config, widget config,
    // automations pause-all, business profile) are owner-only.
    const membership = await getCurrentMembership();
    if (membership && membership.role !== "owner") redirect("/dashboard");
  }

  const business = isSupabaseConfigured ? await getBusinessForCurrentUser() : null;
  const whatsappConnection =
    isSupabaseConfigured && business ? await getWhatsAppConnection(business.id) : null;
  const leadWidget =
    isSupabaseConfigured && business ? await ensureWidgetForBusiness(business.id) : null;
  const automations =
    isSupabaseConfigured && business ? await listAutomationsForBusiness(business.id) : [];
  const activeAutomationCount = automations.filter((a) => a.status === "active").length;
  const serviceBaselines =
    isSupabaseConfigured && business ? await listServiceBaselines(business.id) : [];
  const suggestedServices =
    isSupabaseConfigured && business ? await listDistinctServiceNamesForBusiness(business.id) : [];
  const messageTemplates = isSupabaseConfigured && business ? await listMessageTemplates(business.id) : [];

  // Derived from the request itself (never hardcoded) so the embed snippet
  // always points at wherever this Accelio instance is actually running —
  // staging or production.
  const headersList = headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const siteOrigin = `${protocol}://${host}`;

  return (
    <>
      <TopBar title="Settings" />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 sm:p-8">
        {email && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <UserCircle className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Account</CardTitle>
                  <CardDescription>Signed in as {email}.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <LogoutButton className="w-auto" />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Store className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Business profile</CardTitle>
              <CardDescription>How your business appears to Accelio and your customers.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured ? (
              business ? (
                <BusinessProfileForm
                  initialName={business.name}
                  initialType={business.business_type ?? ""}
                  initialCity={business.city ?? ""}
                  initialOwnerName={business.owner_name ?? ""}
                  initialPhone={business.phone ?? ""}
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Finish the quick setup steps to create your business profile.
                  </p>
                  <Link href="/onboarding" className={buttonVariants({ size: "sm" })}>
                    Finish setting up
                  </Link>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Business name</label>
                    <Input defaultValue={BUSINESS.name} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Business type</label>
                    <Input defaultValue={BUSINESS.type} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">City</label>
                    <Input defaultValue={BUSINESS.city} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Owner</label>
                    <Input defaultValue={BUSINESS.ownerName} disabled />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect Supabase (see the Database connection card below) to edit real business details.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-50 text-success-600">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>WhatsApp Business</CardTitle>
              <CardDescription>Connect the number you message customers from.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured ? (
              business ? (
                <WhatsAppConnectionCard
                  envConfigured={isWhatsAppEnvConfigured}
                  status={whatsappConnection?.connection_status ?? "not_connected"}
                  phoneNumberId={whatsappConnection?.phone_number_id ?? ""}
                  businessAccountId={whatsappConnection?.business_account_id ?? ""}
                  displayPhoneNumber={whatsappConnection?.display_phone_number ?? null}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Finish setting up your business profile first.
                </p>
              )
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">+91 98765 43210 · Luxury Hair Studio</p>
                <Badge variant="success">Connected</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {isSupabaseConfigured && business && (
          <Card id="whatsapp-templates">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-50 text-success-600">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>WhatsApp templates</CardTitle>
                <CardDescription>Approved messages for reminders, offers, reviews, bills and your daily digest.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <WhatsAppTemplatesCard
                templates={messageTemplates}
                language={businessTemplateLanguage(business)}
                discreet={business.discreet_reminders === true}
                whatsappConnected={whatsappConnection?.connection_status === "connected"}
                hasBusinessAccountId={Boolean(whatsappConnection?.business_account_id)}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Website lead capture</CardTitle>
              <CardDescription>A small form your website visitors can use to reach you — no Accelio account needed.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured ? (
              business && leadWidget ? (
                <LeadWidgetCard widget={leadWidget} siteOrigin={siteOrigin} />
              ) : (
                <p className="text-sm text-muted-foreground">Finish setting up your business profile first.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Connect Supabase to set up website lead capture.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50 text-warning-600">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Automations</CardTitle>
              <CardDescription>Safe, predefined WhatsApp follow-ups you turn on and stay in control of.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured && business ? (
              <AutomationsPauseAllCard
                isPaused={Boolean(business.automations_paused_at)}
                activeAutomationCount={activeAutomationCount}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Finish setting up your business profile first.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Service return intervals</CardTitle>
              <CardDescription>
                How often customers should return for each service — used to give new customers a relevant
                recommendation before Accelio has learned their own pattern.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured && business ? (
              <ServiceBaselinesCard baselines={serviceBaselines} suggestedServices={suggestedServices} />
            ) : (
              <p className="text-sm text-muted-foreground">Finish setting up your business profile first.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Customer data</CardTitle>
              <CardDescription>Manage where your customer records come from.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isSupabaseConfigured
                ? "CSV/Excel import isn't built yet — add customers one at a time from the Customers page."
                : "22 customers imported from customers.xlsx"}
            </p>
            {!isSupabaseConfigured && (
              <Button size="sm" variant="secondary">
                Re-import
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                <Server className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Database connection</CardTitle>
                <CardDescription>The Supabase project holding your real business and customer data.</CardDescription>
              </div>
            </div>
            <SupabaseStatus />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>, then run the migration in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase/migrations/</code> to connect a real
              project (see <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.example</code>).
            </p>
          </CardContent>
        </Card>

        {isDevelopment && isSupabaseConfigured && business && (
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50 text-warning-600">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Developer tools</CardTitle>
                <CardDescription>
                  Only visible in development. Adds a handful of realistic sample customers to try the app with.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SeedDemoDataButton />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50 text-warning-600">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Choose when Accelio should ping you.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Daily opportunity summary · 9:00 AM</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Subscription</CardTitle>
                <CardDescription>You&apos;re on the free plan.</CardDescription>
              </div>
            </div>
            <Button size="sm" variant="secondary">
              Upgrade
            </Button>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
