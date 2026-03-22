import { NextRequest, NextResponse } from "next/server";
import { getArchivedExcerpts } from "@/lib/db";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const tagsParam = params.get("tags");
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined;

  const filters = {
    tags,
    search: params.get("search") ?? undefined,
    limit: params.has("limit") ? Number(params.get("limit")) : 200,
    offset: params.has("offset") ? Number(params.get("offset")) : 0,
  };

  const result = getArchivedExcerpts(filters);
  return NextResponse.json(result);
}
