import type { ColumnMapping, ReeloField } from "@/types/import";

const FIELD_SYNONYMS: Record<ReeloField, string[]> = {
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
  const used = new Set<ReeloField>();

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    let matched: ReeloField | null = null;

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS) as [ReeloField, string[]][]) {
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

export function mappedField(mapping: ColumnMapping, field: ReeloField): string | null {
  for (const [header, mapped] of Object.entries(mapping)) {
    if (mapped === field) return header;
  }
  return null;
}

export function hasRequiredMapping(mapping: ColumnMapping): boolean {
  return mappedField(mapping, "name") !== null && mappedField(mapping, "phone") !== null;
}
