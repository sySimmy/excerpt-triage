import { NextRequest, NextResponse } from "next/server";
import { getExcerpts, getStats } from "@/lib/db";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Convert captured_within (days) to a date string
  let captured_after: string | undefined;
  const capturedWithin = params.get("captured_within");
  if (capturedWithin) {
    const days = Number(capturedWithin);
    if (days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      captured_after = d.toISOString().slice(0, 10);
    }
  }

  const filters = {
    status: params.get("status") ?? undefined,
    source_type: params.get("source_type") ?? undefined,
    signal_min: params.has("signal_min") ? Number(params.get("signal_min")) : undefined,
    signal_max: params.has("signal_max") ? Number(params.get("signal_max")) : undefined,
    tag: params.get("tag") ?? undefined,
    search: params.get("search") ?? undefined,
    captured_after,
    sort: params.get("sort") ?? undefined,
    exclude_archived: true,
    limit: params.has("limit") ? Number(params.get("limit")) : 50,
    offset: params.has("offset") ? Number(params.get("offset")) : 0,
  };

  const result = getExcerpts(filters);
  const stats = getStats();

  return NextResponse.json({ ...result, stats });
}
