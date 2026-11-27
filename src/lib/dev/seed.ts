"use server";

import { isDevelopment } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessForCurrentUser } from "@/lib/business/queries";
import type { CustomerStatus } from "@/types";

interface DemoVisit {
  service: string;
  amount: number;
  daysAgo: number;
}

interface DemoCustomer {
  name: string;
  phone: string;
  status: CustomerStatus;
  visits: DemoVisit[];
}

const DEMO_CUSTOMERS: DemoCustomer[] = [
  { name: "Rahul Sharma", phone: "+919876543210", status: "due", visits: [{ service: "Haircut", amount: 500, daysAgo: 74 }, { service: "Beard Trim", amount: 250, daysAgo: 120 }] },
  { name: "Priya Verma", phone: "+919821345678", status: "inactive", visits: [{ service: "Facial", amount: 1200, daysAgo: 92 }] },
  { name: "Aman Gupta", phone: "+919911223344", status: "active", visits: [{ service: "Haircut", amount: 500, daysAgo: 12 }] },
  { name: "Neha Singh", phone: "+919765432109", status: "inactive", visits: [{ service: "Hair Color", amount: 2200, daysAgo: 130 }] },
  { name: "Rohit Mehta", phone: "+919898989898", status: "due", visits: [{ service: "Haircut", amount: 500, daysAgo: 58 }] },
  { name: "Simran Kaur", phone: "+919654321098", status: "active", visits: [{ service: "Manicure", amount: 600, daysAgo: 8 }] },
  { name: "Pooja Arora", phone: "+919012345678", status: "active", visits: [{ service: "Hair Spa", amount: 1500, daysAgo: 3 }] },
  { name: "Divya Menon", phone: "+919556677889", status: "follow_up", visits: [{ service: "Facial", amount: 1200, daysAgo: 2 }] },
];

/**
 * Development-only sample data so the app looks realistic while building.
 * Guarded by `isDevelopment`, which reads the server-side `NODE_ENV` — not a
 * `NEXT_PUBLIC_*` value the client could influence — so this can never run
 * against a production deployment no matter what a client sends. Nothing in
 * production UI calls this; only a dev-only Settings card does.
 */
export async function seedDemoCustomers(): Promise<{ error?: string; inserted?: number }> {
  if (!isDevelopment) {
    return { error: "Demo data can only be loaded in development." };
  }

  let business;
  try {
    business = await requireBusinessForCurrentUser();
  } catch {
    return { error: "Set up your business profile first." };
  }

  const supabase = createClient();

  const { count, error: countError } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);

  if (countError) return { error: countError.message };
  if (count && count > 0) {
    return { error: "You already have customers — demo data is only offered for an empty account." };
  }

  let inserted = 0;
  for (const demo of DEMO_CUSTOMERS) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ business_id: business.id, name: demo.name, phone: demo.phone, status: demo.status, whatsapp_consent: true, consent_source: "manual", consent_at: new Date().toISOString() })
      .select("id")
      .single();

    if (customerError || !customer) continue;

    for (const visit of demo.visits) {
      const occurredAt = new Date(Date.now() - visit.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("customer_events").insert({
        business_id: business.id,
        customer_id: customer.id,
        event_type: "visit",
        service: visit.service,
        amount: visit.amount,
        occurred_at: occurredAt,
      });
    }
    inserted += 1;
  }

  return { inserted };
}
