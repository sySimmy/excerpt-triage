import { NextRequest, NextResponse } from "next/server";
import { getExcerpts, getStats } from "@/lib/db";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Convert captured_within (days) to a date string
  // "1" = today only, "3" = last 3 days, etc.
  let captured_after: string | undefined;
  let captured_before: string | undefined;
  let published_after: string | undefined;
  let published_before: string | undefined;

  const capturedWithin = params.get("captured_within");
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");
  const dateField = params.get("date_field") ?? "captured";

  if (dateFrom || dateTo) {
    // Custom date range
    if (dateField === "published") {
      if (dateFrom) published_after = dateFrom;
      if (dateTo) published_before = dateTo;
    } else {
      if (dateFrom) captured_after = dateFrom;
      if (dateTo) captured_before = dateTo;
    }
  } else if (capturedWithin) {
    const days = Number(capturedWithin);
    if (days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1));
      captured_after = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    captured_before,
    published_after,
    published_before,
    sort: params.get("sort") ?? undefined,
    exclude_archived: true,
    exclude_deep_read: true,
    exclude_learning: true,
    limit: params.has("limit") ? Number(params.get("limit")) : 50,
    offset: params.has("offset") ? Number(params.get("offset")) : 0,
  };

  const result = getExcerpts(filters);
  const stats = getStats();

  return NextResponse.json({ ...result, stats });
}
