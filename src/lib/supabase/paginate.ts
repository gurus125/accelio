/**
 * Supabase's REST API returns at most 1,000 rows per request, silently.
 * Any query that can grow past that (customers, events, messages for a
 * busy salon) must either aggregate in SQL or page through with
 * `.range()`. This helper does the paging.
 *
 * Pure: no Supabase import, so it is unit-tested directly. The caller
 * builds the query for one page; it MUST include a stable `.order(...)`
 * (ideally ending in a unique column such as `id`), otherwise rows can be
 * skipped or repeated between pages.
 */

export const SUPABASE_MAX_ROWS = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** Fetches every row by calling `fetchPage(from, to)` (inclusive range,
 * exactly what `.range(from, to)` takes) until a short page comes back.
 * `maxRows` is a safety valve against runaway loops. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? SUPABASE_MAX_ROWS;
  const maxRows = options.maxRows ?? 200_000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

/** Splits a list into chunks — for `.in("id", ids)` filters, which put
 * every id in the request URL and fail for very long lists. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
