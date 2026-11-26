import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names safely, resolving conflicts (shadcn-style helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an integer amount as Indian Rupees, e.g. 4800 -> "₹4,800". */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a number of days ago into a human string, e.g. "74 days ago". */
export function formatDaysAgo(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Initials from a full name, e.g. "Rahul Sharma" -> "RS". */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Format a phone number into a readable Indian format. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return phone;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
