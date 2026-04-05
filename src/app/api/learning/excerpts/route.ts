import { NextRequest, NextResponse } from "next/server";
import { getLearningExcerpts } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

  const result = getLearningExcerpts({ search, limit, offset });

  return NextResponse.json(result);
}
