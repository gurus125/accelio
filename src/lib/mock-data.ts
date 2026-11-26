import type { Business, Campaign, CommunicationEvent, Customer } from "@/types";

/**
 * All "days ago" figures in this file are anchored to a fixed date rather than
 * `Date.now()`, so the prototype renders identically on the server and the
 * client (no hydration drift) and the numbers in the spec stay stable.
 */
export const ANCHOR_DATE = new Date("2026-09-15T09:00:00+05:30");

function isoDaysAgo(days: number): string {
  const d = new Date(ANCHOR_DATE);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function status(daysAgo: number, avgReturn: number): Customer["status"] {
  if (daysAgo > avgReturn * 2 || daysAgo > 120) return "inactive";
  if (daysAgo > avgReturn) return "due";
  return "active";
}

interface RawCustomer {
  id: string;
  name: string;
  phone: string;
  lastVisitDaysAgo: number;
  visitCount: number;
  totalSpent: number;
  averageReturnDays: number;
  services: string[];
  favoriteService?: string;
  tags?: string[];
}

const RAW_CUSTOMERS: RawCustomer[] = [
  {
    id: "c1",
    name: "Rahul Sharma",
    phone: "9876543210",
    lastVisitDaysAgo: 74,
    visitCount: 12,
    totalSpent: 4800,
    averageReturnDays: 45,
    services: ["Haircut", "Beard Trim", "Haircut", "Haircut", "Facial"],
    favoriteService: "Haircut",
  },
  {
    id: "c2",
    name: "Priya Verma",
    phone: "9821345678",
    lastVisitDaysAgo: 92,
    visitCount: 18,
    totalSpent: 7200,
    averageReturnDays: 60,
    services: ["Facial", "Haircut", "Manicure", "Facial", "Hair Spa"],
    favoriteService: "Facial",
    tags: ["High value"],
  },
  {
    id: "c3",
    name: "Aman Gupta",
    phone: "9911223344",
    lastVisitDaysAgo: 12,
    visitCount: 9,
    totalSpent: 3200,
    averageReturnDays: 30,
    services: ["Haircut", "Beard Trim", "Haircut"],
  },
  {
    id: "c4",
    name: "Neha Singh",
    phone: "9765432109",
    lastVisitDaysAgo: 130,
    visitCount: 6,
    totalSpent: 2600,
    averageReturnDays: 50,
    services: ["Hair Color", "Haircut", "Hair Spa"],
    tags: ["Lapsed"],
  },
  {
    id: "c5",
    name: "Rohit Mehta",
    phone: "9898989898",
    lastVisitDaysAgo: 58,
    visitCount: 21,
    totalSpent: 9400,
    averageReturnDays: 40,
    services: ["Haircut", "Facial", "Haircut", "Beard Trim"],
    favoriteService: "Haircut",
    tags: ["High value"],
  },
  {
    id: "c6",
    name: "Simran Kaur",
    phone: "9654321098",
    lastVisitDaysAgo: 8,
    visitCount: 14,
    totalSpent: 6100,
    averageReturnDays: 35,
    services: ["Manicure", "Pedicure", "Facial"],
  },
  {
    id: "c7",
    name: "Ankit Jain",
    phone: "9123456780",
    lastVisitDaysAgo: 101,
    visitCount: 4,
    totalSpent: 1800,
    averageReturnDays: 45,
    services: ["Haircut", "Haircut"],
    tags: ["Lapsed"],
  },
  {
    id: "c8",
    name: "Pooja Arora",
    phone: "9012345678",
    lastVisitDaysAgo: 3,
    visitCount: 27,
    totalSpent: 12300,
    averageReturnDays: 25,
    services: ["Hair Spa", "Facial", "Haircut", "Manicure"],
    favoriteService: "Hair Spa",
    tags: ["High value"],
  },
  {
    id: "c9",
    name: "Vikram Rao",
    phone: "9345678901",
    lastVisitDaysAgo: 66,
    visitCount: 8,
    totalSpent: 3600,
    averageReturnDays: 40,
    services: ["Haircut", "Beard Trim"],
  },
  {
    id: "c10",
    name: "Kavita Nair",
    phone: "9456789012",
    lastVisitDaysAgo: 45,
    visitCount: 11,
    totalSpent: 5400,
    averageReturnDays: 42,
    services: ["Facial", "Haircut", "Threading"],
  },
  {
    id: "c11",
    name: "Suresh Iyer",
    phone: "9567890123",
    lastVisitDaysAgo: 155,
    visitCount: 3,
    totalSpent: 1200,
    averageReturnDays: 60,
    services: ["Haircut"],
    tags: ["Lapsed"],
  },
  {
    id: "c12",
    name: "Meera Joshi",
    phone: "9678901234",
    lastVisitDaysAgo: 20,
    visitCount: 16,
    totalSpent: 8100,
    averageReturnDays: 30,
    services: ["Hair Color", "Hair Spa", "Facial"],
    tags: ["High value"],
  },
  {
    id: "c13",
    name: "Deepak Chawla",
    phone: "9789012345",
    lastVisitDaysAgo: 82,
    visitCount: 7,
    totalSpent: 2900,
    averageReturnDays: 50,
    services: ["Haircut", "Beard Trim", "Haircut"],
  },
  {
    id: "c14",
    name: "Anjali Bhatt",
    phone: "9890123456",
    lastVisitDaysAgo: 5,
    visitCount: 22,
    totalSpent: 10500,
    averageReturnDays: 28,
    services: ["Manicure", "Pedicure", "Facial", "Hair Spa"],
    favoriteService: "Pedicure",
    tags: ["High value"],
  },
  {
    id: "c15",
    name: "Manish Kumar",
    phone: "9001122334",
    lastVisitDaysAgo: 110,
    visitCount: 5,
    totalSpent: 2100,
    averageReturnDays: 45,
    services: ["Haircut", "Haircut"],
    tags: ["Lapsed"],
  },
  {
    id: "c16",
    name: "Ritu Malhotra",
    phone: "9112233445",
    lastVisitDaysAgo: 38,
    visitCount: 13,
    totalSpent: 6700,
    averageReturnDays: 35,
    services: ["Facial", "Threading", "Haircut"],
  },
  {
    id: "c17",
    name: "Arjun Reddy",
    phone: "9223344556",
    lastVisitDaysAgo: 15,
    visitCount: 10,
    totalSpent: 3900,
    averageReturnDays: 30,
    services: ["Haircut", "Beard Trim"],
  },
  {
    id: "c18",
    name: "Sneha Kulkarni",
    phone: "9334455667",
    lastVisitDaysAgo: 70,
    visitCount: 19,
    totalSpent: 8800,
    averageReturnDays: 40,
    services: ["Hair Spa", "Facial", "Manicure"],
    tags: ["High value"],
  },
  {
    id: "c19",
    name: "Karan Chopra",
    phone: "9445566778",
    lastVisitDaysAgo: 95,
    visitCount: 6,
    totalSpent: 2400,
    averageReturnDays: 45,
    services: ["Haircut", "Haircut"],
  },
  {
    id: "c20",
    name: "Divya Menon",
    phone: "9556677889",
    lastVisitDaysAgo: 2,
    visitCount: 25,
    totalSpent: 11200,
    averageReturnDays: 25,
    services: ["Facial", "Hair Color", "Manicure"],
    favoriteService: "Facial",
    tags: ["High value"],
  },
  {
    id: "c21",
    name: "Nikhil Bansal",
    phone: "9667788990",
    lastVisitDaysAgo: 50,
    visitCount: 8,
    totalSpent: 3100,
    averageReturnDays: 30,
    services: ["Haircut", "Beard Trim"],
  },
  {
    id: "c22",
    name: "Shreya Pillai",
    phone: "9778899001",
    lastVisitDaysAgo: 118,
    visitCount: 4,
    totalSpent: 1600,
    averageReturnDays: 40,
    services: ["Haircut", "Threading"],
    tags: ["Lapsed"],
  },
];

function buildHistory(raw: RawCustomer): Customer["history"] {
  const prices: Record<string, number> = {
    Haircut: 500,
    "Beard Trim": 250,
    Facial: 1200,
    Manicure: 600,
    Pedicure: 700,
    "Hair Spa": 1500,
    "Hair Color": 2200,
    Threading: 150,
  };
  let cursor = raw.lastVisitDaysAgo;
  return raw.services
    .slice()
    .reverse()
    .map((service, idx) => {
      const daysAgo = cursor + idx * Math.max(raw.averageReturnDays - 5, 14);
      return {
        id: `${raw.id}-v${idx}`,
        service,
        amount: prices[service] ?? 500,
        date: isoDaysAgo(daysAgo),
      };
    })
    .reverse();
}

export const CUSTOMERS: Customer[] = RAW_CUSTOMERS.map((raw) => ({
  id: raw.id,
  name: raw.name,
  phone: raw.phone,
  lastVisit: isoDaysAgo(raw.lastVisitDaysAgo),
  lastVisitDaysAgo: raw.lastVisitDaysAgo,
  visitCount: raw.visitCount,
  totalSpent: raw.totalSpent,
  averageReturnDays: raw.averageReturnDays,
  status: status(raw.lastVisitDaysAgo, raw.averageReturnDays),
  services: raw.services,
  history: buildHistory(raw),
  tags: raw.tags,
  favoriteService: raw.favoriteService,
}));

export function getCustomerById(id: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.id === id);
}

export const BUSINESS: Business = {
  name: "Luxury Hair Studio",
  ownerName: "Siva",
  type: "Salon",
  city: "Bengaluru",
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "camp1",
    name: "Bring back inactive customers",
    audienceSize: 84,
    status: "sent",
    statusLabel: "Sent 3 days ago",
    createdAt: isoDaysAgo(3),
    message:
      "Hi {{name}}, it's been a while since your last visit to Luxury Hair Studio. We'd love to see you again — book your next appointment today!",
  },
  {
    id: "camp2",
    name: "Birthday offers",
    audienceSize: 23,
    status: "active",
    statusLabel: "Active",
    createdAt: isoDaysAgo(10),
    message:
      "Happy birthday {{name}}! Enjoy 20% off any service this month, on us. 🎉",
  },
  {
    id: "camp3",
    name: "New service announcement",
    audienceSize: 41,
    status: "draft",
    statusLabel: "Draft",
    createdAt: isoDaysAgo(1),
    message: "We've just launched keratin treatments — book a slot this week!",
  },
  {
    id: "camp4",
    name: "Festival offer",
    audienceSize: 128,
    status: "completed",
    statusLabel: "Completed",
    createdAt: isoDaysAgo(45),
    message: "Festive season is here! Flat 15% off all services till Sunday.",
  },
];

const COMM_STATUSES: CommunicationEvent["status"][] = [
  "sent",
  "delivered",
  "read",
  "replied",
];

function buildActivityFeed(): CommunicationEvent[] {
  const events: CommunicationEvent[] = [];
  const pool = CUSTOMERS.slice(0, 16);
  pool.forEach((customer, idx) => {
    const hoursAgo = idx * 3 + 1;
    const d = new Date(ANCHOR_DATE);
    d.setHours(d.getHours() - hoursAgo);
    const statusIdx = idx % COMM_STATUSES.length;
    events.push({
      id: `evt-${customer.id}`,
      customerId: customer.id,
      campaignName: idx % 3 === 0 ? "Bring back inactive customers" : undefined,
      status: COMM_STATUSES[statusIdx],
      timestamp: d.toISOString(),
      message:
        statusIdx === 3
          ? "Yes, I'd like to book for this weekend!"
          : `Hi ${customer.name.split(" ")[0]}! We'd love to see you again at Luxury Hair Studio 😊`,
    });
  });
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export const ACTIVITY_FEED: CommunicationEvent[] = buildActivityFeed();

export const ACTIVITY_SUMMARY = {
  sent: 184,
  delivered: 179,
  read: 143,
  replies: 31,
};
