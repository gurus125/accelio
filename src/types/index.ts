export type CustomerStatus = "active" | "due" | "inactive" | "follow_up";

export type OpportunityReason =
  | "due_to_return"
  | "inactive"
  | "follow_up"
  | "offer";

export interface ServiceVisit {
  id: string;
  service: string;
  amount: number;
  date: string; // ISO date
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  lastVisit: string; // ISO date
  lastVisitDaysAgo: number;
  visitCount: number;
  totalSpent: number;
  averageReturnDays: number;
  status: CustomerStatus;
  services: string[];
  history: ServiceVisit[];
  tags?: string[];
  favoriteService?: string;
}

export interface Opportunity {
  id: string;
  customerId: string;
  reason: OpportunityReason;
  reasonLabel: string;
  explanation: string;
  suggestedMessage: string;
  priority: number; // 1 = highest
}

export type CommunicationStatus = "sent" | "delivered" | "read" | "replied";

export interface CommunicationEvent {
  id: string;
  customerId: string;
  campaignName?: string;
  status: CommunicationStatus;
  timestamp: string; // ISO datetime
  message: string;
}

export type CampaignStatus = "draft" | "active" | "sent" | "completed";

export interface Campaign {
  id: string;
  name: string;
  audienceSize: number;
  status: CampaignStatus;
  statusLabel: string;
  createdAt: string;
  message?: string;
}

/** The single mock business record used only when Supabase isn't configured
 * yet — becomes the real `businesses` table (see `@/types/database`) once it is. */
export interface Business {
  name: string;
  ownerName: string;
  type: string;
  city: string;
}

/** Alias kept for readability where "activity" is the more natural name than "communication event". */
export type ActivityEvent = CommunicationEvent;
