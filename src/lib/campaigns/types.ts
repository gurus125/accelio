import type { MessageLanguage, MessageTone } from "@/lib/ai/types";

export type CampaignType =
  | "custom"
  | "inactive_customers"
  | "due_for_return"
  | "high_value_inactive"
  | "follow_up"
  | "service_reminder";

export type CampaignStatus = "draft" | "review" | "approved" | "sending" | "completed" | "failed" | "cancelled";

/** Same vocabulary as `messages.status` (Phase 9) plus "selected"/"skipped",
 * which only ever exist before/instead of a send. A recipient's status
 * mirrors its linked `messages` row once one exists — see the Phase 10
 * migration's comment on why this isn't a second, independent tracking
 * system. */
export type CampaignRecipientStatus =
  | "selected"
  | "ready"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "skipped";

export interface CampaignRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  message_template: string | null;
  tone: MessageTone | null;
  language: MessageLanguage | null;
  created_by: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipientRow {
  id: string;
  campaign_id: string;
  business_id: string;
  customer_id: string;
  status: CampaignRecipientStatus;
  message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignResultCounts {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  /** Selected/ready recipients not yet attempted (campaign still draft/
   * review/approved, or sending was interrupted). */
  pending: number;
}

/** A recipient row joined with just enough customer data to render a
 * preview/results table — never the customer's full record. */
export interface CampaignRecipientWithCustomer extends CampaignRecipientRow {
  customerName: string;
  customerPhone: string;
  /** Milestone 1 — false when the customer opted out or never agreed
   * to WhatsApp messages; the send loop skips them. */
  customerCanMessage: boolean;
}

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  custom: "Custom selection",
  inactive_customers: "Inactive customers",
  due_for_return: "Due to return",
  high_value_inactive: "High-value inactive",
  follow_up: "Follow-up",
  service_reminder: "Service reminder",
};

export const CAMPAIGN_TYPE_DESCRIPTIONS: Record<CampaignType, string> = {
  custom: "Customers you pick yourself.",
  inactive_customers: "Customers who haven't visited in a long time.",
  due_for_return: "Customers who usually return on a schedule and are now overdue.",
  high_value_inactive: "High-spending customers who have gone quiet.",
  follow_up: "Customers with an open enquiry that hasn't converted yet.",
  service_reminder: "Customers due for a service they get regularly.",
};
