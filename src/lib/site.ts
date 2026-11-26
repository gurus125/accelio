import { headers } from "next/headers";

/**
 * The origin this request actually arrived on (derived from headers, never
 * hardcoded) — same approach `/settings` already uses for its widget embed
 * snippet, factored out here so the Phase 15 invite flow can build links
 * that work in dev, staging, and production alike.
 */
export function getSiteOrigin(): string {
  const headersList = headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}
