import { NextResponse } from "next/server";
import { getArchivedTags } from "@/lib/db";

export async function GET() {
  const tags = getArchivedTags();
  return NextResponse.json({ tags });
}
