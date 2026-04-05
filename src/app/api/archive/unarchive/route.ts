import { NextRequest, NextResponse } from "next/server";
import { unarchiveExcerpt } from "@/lib/archiver";
import { getExcerptById, logActivity } from "@/lib/db";
import { VAULT_PATH } from "@/lib/env";

export async function POST(request: NextRequest) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const excerpt = getExcerptById(id);
  const result = unarchiveExcerpt(VAULT_PATH, id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (excerpt) {
    logActivity({
      excerpt_id: id,
      action: "unarchive",
      title: excerpt.title,
      source_type: excerpt.source_type,
      source_name: excerpt.source_name,
      tags: excerpt.tags,
      signal: excerpt.signal,
    });
  }

  return NextResponse.json({ success: true, newPath: result.newPath });
}
