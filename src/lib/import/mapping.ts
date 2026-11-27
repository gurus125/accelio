import type { ColumnMapping, AccelioField } from "@/types/import";

const FIELD_SYNONYMS: Record<AccelioField, string[]> = {
  name: ["name", "customer name", "full name", "customer"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact number", "contact"],
  email: ["email", "email address", "e-mail"],
  lastVisit: ["last visit", "last purchase", "lastvisit", "last visit date", "last visit on"],
  service: ["service", "last service", "services", "service name", "treatment", "last treatment"],
  totalSpent: ["amount", "total spent", "lifetime value", "totalspent", "total amount", "spent"],
  visitCount: ["visit count", "visits", "total visits", "visitcount", "number of visits"],
  notes: ["notes", "note", "comment", "comments", "remarks"],
};

/** Best-effort automatic column → field suggestions based on common header
 * names. Always overridable by the user — nothing here is final. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<AccelioField>();

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    let matched: AccelioField | null = null;

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS) as [AccelioField, string[]][]) {
      if (used.has(field)) continue;
      if (synonyms.includes(normalized)) {
        matched = field;
        break;
      }
    }

    mapping[header] = matched;
    if (matched) used.add(matched);
  }

  return mapping;
}

export function mappedField(mapping: ColumnMapping, field: AccelioField): string | null {
  for (const [header, mapped] of Object.entries(mapping)) {
    if (mapped === field) return header;
  }
  return null;
}

export function hasRequiredMapping(mapping: ColumnMapping): boolean {
  return mappedField(mapping, "name") !== null && mappedField(mapping, "phone") !== null;
}
