import { NextResponse } from "next/server";
import { checkSupabaseConnection } from "@/lib/supabase/health";

// Never cache a health check.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkSupabaseConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
