import { NextRequest, NextResponse } from "next/server";
import { getExcerptById, updateExcerpt, logActivity } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { id } = await request.json();

  const excerpt = getExcerptById(id);
  if (!excerpt) {
    return NextResponse.json({ error: "Excerpt not found" }, { status: 404 });
  }
  if (excerpt.location === "archived") {
    return NextResponse.json({ error: "Already archived" }, { status: 400 });
  }

  updateExcerpt(id, { status: "deep_read" });

  logActivity({
    excerpt_id: id,
    action: "deep_read",
    title: excerpt.title,
    source_type: excerpt.source_type,
    source_name: excerpt.source_name,
    tags: excerpt.tags,
    signal: excerpt.signal,
  });

  return NextResponse.json({ success: true });
}
