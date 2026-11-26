/**
 * Minimal ambient types for the `xlsx` package, used ONLY so this project
 * type-checks before `npm install` has actually fetched `xlsx` (this
 * sandbox's registry access is more restricted than your own machine's —
 * see the Phase 5 README section). Once you run `npm install`, the real
 * package ships its own (more complete) types, and TypeScript's module
 * resolution prefers those automatically — this file simply stops being
 * used. Safe to delete after installing, or safe to leave in place.
 */
declare module "xlsx" {
  export interface WorkSheet {
    [cell: string]: unknown;
  }

  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }

  export interface ReadOptions {
    type?: "array" | "string" | "buffer" | "binary" | "base64";
    cellDates?: boolean;
    raw?: boolean;
  }

  export interface Sheet2JsonOpts {
    header?: number | string[];
    raw?: boolean;
    defval?: unknown;
    blankrows?: boolean;
  }

  export function read(data: unknown, opts?: ReadOptions): WorkBook;

  export const utils: {
    sheet_to_json<T = unknown[]>(worksheet: WorkSheet, opts?: Sheet2JsonOpts): T[];
  };
}
