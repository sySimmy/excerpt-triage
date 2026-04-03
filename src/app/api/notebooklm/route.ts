import { NextRequest, NextResponse } from "next/server";
import { getExcerptById, logActivity } from "@/lib/db";
import { callNotebookLM } from "@/lib/notebooklm";
import fs from "fs";

export async function POST(request: NextRequest) {
  const { id } = await request.json();

  const excerpt = getExcerptById(id);
  if (!excerpt) {
    return NextResponse.json({ error: "Excerpt not found" }, { status: 404 });
  }

  // Read file content (strip frontmatter)
  let content = "";
  try {
    if (fs.existsSync(excerpt.file_path)) {
      const raw = fs.readFileSync(excerpt.file_path, "utf-8");
      const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
      content = fmMatch ? raw.slice(fmMatch[0].length) : raw;
    }
  } catch {
    return NextResponse.json({ error: "Failed to read excerpt file" }, { status: 500 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "Excerpt has no content" }, { status: 400 });
  }

  const title = excerpt.title ?? "Untitled";

  const result = await callNotebookLM("add-source", { title }, { stdin: content });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  logActivity({
    excerpt_id: id,
    action: "notebooklm",
    title: excerpt.title,
    source_type: excerpt.source_type,
    source_name: excerpt.source_name,
    tags: excerpt.tags,
    signal: excerpt.signal,
  });

  return NextResponse.json({ success: true, source_id: result.source_id });
}
