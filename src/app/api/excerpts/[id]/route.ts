import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getExcerptById, updateExcerpt } from "@/lib/db";
import { updateFrontmatterFields } from "@/lib/frontmatter";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const excerpt = getExcerptById(Number(id));
  if (!excerpt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Read file content
  let content = "";
  try {
    if (fs.existsSync(excerpt.file_path)) {
      content = fs.readFileSync(excerpt.file_path, "utf-8");
      // Strip frontmatter for display
      const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
      if (fmMatch) {
        content = content.slice(fmMatch[0].length);
      }
    }
  } catch {
    content = "[Error reading file]";
  }

  return NextResponse.json({ ...excerpt, content });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const excerpt = getExcerptById(Number(id));
  if (!excerpt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status, signal, tags, source_type, topic, translation } = body;

  // Update SQLite
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (signal !== undefined) updates.signal = signal;
  if (tags !== undefined) updates.tags = JSON.stringify(tags);
  if (source_type !== undefined) updates.source_type = source_type;
  if (topic !== undefined) updates.topic = topic;

  updateExcerpt(Number(id), updates);

  // Also update frontmatter in file
  try {
    if (fs.existsSync(excerpt.file_path)) {
      const fmUpdates: Record<string, unknown> = {};
      if (status !== undefined) fmUpdates.status = status;
      if (signal !== undefined) fmUpdates.signal = signal;
      if (tags !== undefined) fmUpdates.tags = tags;
      if (source_type !== undefined) fmUpdates.source_type = source_type;
      if (topic !== undefined) fmUpdates.topic = topic;
      updateFrontmatterFields(excerpt.file_path, fmUpdates);

      // Append translation below original content
      if (translation) {
        const raw = fs.readFileSync(excerpt.file_path, "utf-8");
        if (!raw.includes("\n---\n## 译文\n")) {
          const translated = raw.trimEnd() + "\n\n---\n## 译文\n\n" + translation.trimEnd() + "\n";
          fs.writeFileSync(excerpt.file_path, translated, "utf-8");
        }
      }
    }
  } catch (e) {
    console.error("Failed to update frontmatter:", e);
  }

  return NextResponse.json({ success: true });
}
