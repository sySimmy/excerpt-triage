import { NextRequest, NextResponse } from "next/server";
import { archiveExcerpt, deleteExcerptFile } from "@/lib/archiver";
import { getExcerptById, logActivity } from "@/lib/db";
import { VAULT_PATH } from "@/lib/env";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, tags, signal, source_type, topic } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const excerpt = getExcerptById(id);
  const result = archiveExcerpt(VAULT_PATH, id, { tags, signal, source_type, topic });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Log activity after successful archive
  if (excerpt) {
    logActivity({
      excerpt_id: id,
      action: "archive",
      title: excerpt.title,
      source_type: tags ? (source_type ?? excerpt.source_type) : excerpt.source_type,
      source_name: excerpt.source_name,
      tags: tags ? JSON.stringify(tags) : excerpt.tags,
      signal: signal ?? excerpt.signal,
    });
  }

  return NextResponse.json({ success: true, newPath: result.newPath });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Read excerpt info before deletion (file will be gone after)
  const excerpt = getExcerptById(id);
  const result = deleteExcerptFile(VAULT_PATH, id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Log activity after successful delete
  if (excerpt) {
    logActivity({
      excerpt_id: id,
      action: "delete",
      title: excerpt.title,
      source_type: excerpt.source_type,
      source_name: excerpt.source_name,
      tags: excerpt.tags,
      signal: excerpt.signal,
    });
  }

  return NextResponse.json({ success: true });
}
