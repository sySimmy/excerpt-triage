import { NextRequest, NextResponse } from "next/server";
import { getExcerptById, logActivity, getLearningSession, deleteLearningMaterials, deleteLearningSession, getLearningMaterial } from "@/lib/db";
import { archiveExcerpt } from "@/lib/archiver";
import { callNotebookLM } from "@/lib/notebooklm";
import { VAULT_PATH } from "@/lib/env";
import fs from "fs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, tags, signal, source_type, topic } = body as {
    id: number;
    tags?: string[];
    signal?: number;
    source_type?: string;
    topic?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const excerpt = getExcerptById(id);
  if (!excerpt) {
    return NextResponse.json({ error: "Excerpt not found" }, { status: 404 });
  }

  // Best-effort: delete NotebookLM source
  const session = getLearningSession(id);
  if (session) {
    try {
      await callNotebookLM("delete-source", { "source-id": session.notebooklm_source_id });
    } catch {
      // Best-effort, ignore errors
    }
  }

  // Archive the excerpt
  const result = archiveExcerpt(VAULT_PATH, id, { tags, signal, source_type, topic });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Clean up audio file if exists
  const audioCached = getLearningMaterial(id, "audio");
  if (audioCached) {
    try {
      const { file_path: audioPath } = JSON.parse(audioCached.content) as { file_path: string };
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch {
      // Best-effort, ignore errors
    }
  }

  deleteLearningMaterials(id);
  deleteLearningSession(id);

  logActivity({
    excerpt_id: id,
    action: "learning_archive",
    title: excerpt.title,
    source_type: tags ? (source_type ?? excerpt.source_type) : excerpt.source_type,
    source_name: excerpt.source_name,
    tags: tags ? JSON.stringify(tags) : excerpt.tags,
    signal: signal ?? excerpt.signal,
  });

  return NextResponse.json({ success: true, newPath: result.newPath });
}
