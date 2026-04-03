import { NextRequest, NextResponse } from "next/server";
import { getExcerptById, updateExcerpt, logActivity } from "@/lib/db";
import { updateFrontmatterFields } from "@/lib/frontmatter";
import fs from "fs";

export async function POST(request: NextRequest) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const excerpt = getExcerptById(id);
  if (!excerpt) {
    return NextResponse.json({ error: "Excerpt not found" }, { status: 404 });
  }

  if (excerpt.status !== "learning") {
    return NextResponse.json({ error: "Excerpt is not in learning status" }, { status: 400 });
  }

  updateExcerpt(id, { status: "deep_read" });

  if (fs.existsSync(excerpt.file_path)) {
    updateFrontmatterFields(excerpt.file_path, { status: "精读" });
  }

  logActivity({
    excerpt_id: id,
    action: "learning_finish",
    title: excerpt.title,
    source_type: excerpt.source_type,
    source_name: excerpt.source_name,
    tags: excerpt.tags,
    signal: excerpt.signal,
  });

  return NextResponse.json({ success: true });
}
