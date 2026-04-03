import { NextRequest, NextResponse } from "next/server";
import {
  getExcerptById,
  updateExcerpt,
  logActivity,
  createLearningSession,
  getLearningSession,
} from "@/lib/db";
import { updateFrontmatterFields } from "@/lib/frontmatter";
import { callNotebookLM } from "@/lib/notebooklm";
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

  // Idempotent: if already learning, return existing session
  if (excerpt.status === "learning") {
    const existing = getLearningSession(id);
    if (existing) {
      return NextResponse.json({ success: true, source_id: existing.notebooklm_source_id });
    }
  }

  // Read file content, strip frontmatter
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

  const sourceId = result.source_id as string;

  createLearningSession(id, sourceId);
  updateExcerpt(id, { status: "learning" });

  if (fs.existsSync(excerpt.file_path)) {
    updateFrontmatterFields(excerpt.file_path, { status: "内化" });
  }

  logActivity({
    excerpt_id: id,
    action: "learning_start",
    title: excerpt.title,
    source_type: excerpt.source_type,
    source_name: excerpt.source_name,
    tags: excerpt.tags,
    signal: excerpt.signal,
  });

  return NextResponse.json({ success: true, source_id: sourceId });
}
