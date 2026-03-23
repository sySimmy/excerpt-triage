import { NextRequest, NextResponse } from "next/server";
import { getDeepReadExcerpts } from "@/lib/db";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const filters = {
    search: params.get("search") ?? undefined,
    limit: params.has("limit") ? Number(params.get("limit")) : 200,
    offset: params.has("offset") ? Number(params.get("offset")) : 0,
  };

  const result = getDeepReadExcerpts(filters);
  return NextResponse.json(result);
}
