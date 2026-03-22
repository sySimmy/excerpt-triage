import { NextRequest, NextResponse } from "next/server";
import { archiveExcerpt, deleteExcerptFile } from "@/lib/archiver";
import { getExcerptById, logActivity } from "@/lib/db";

const VAULT_PATH = process.env.VAULT_PATH!;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, tags, signal, source_type, topic } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Log activity before archiving
  const excerpt = getExcerptById(id);
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

  const result = archiveExcerpt(VAULT_PATH, id, { tags, signal, source_type, topic });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, newPath: result.newPath });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Log activity before deleting
  const excerpt = getExcerptById(id);
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

  const result = deleteExcerptFile(VAULT_PATH, id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
