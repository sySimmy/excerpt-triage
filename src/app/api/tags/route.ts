import { NextResponse } from "next/server";
import { getAllTags } from "@/lib/db";

export async function GET() {
  const tags = getAllTags();
  return NextResponse.json(tags);
}
