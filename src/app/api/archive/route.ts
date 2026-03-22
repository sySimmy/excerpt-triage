import { NextRequest, NextResponse } from "next/server";
import { archiveExcerpt, deleteExcerptFile } from "@/lib/archiver";

const VAULT_PATH = process.env.VAULT_PATH!;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, tags, signal, source_type, topic } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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

  const result = deleteExcerptFile(VAULT_PATH, id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
