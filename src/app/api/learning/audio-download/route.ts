import { NextRequest, NextResponse } from "next/server";
import { getLearningSession, getLearningMaterial, saveLearningMaterial } from "@/lib/db";
import { callNotebookLM } from "@/lib/notebooklm";
import fs from "fs";
import path from "path";

const AUDIO_DIR = path.join(process.cwd(), ".nosync", "audio");
const AUDIO_TOOL_TYPE = "audio";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { excerpt_id } = body as { excerpt_id: number };

  if (!excerpt_id) {
    return NextResponse.json({ error: "excerpt_id is required" }, { status: 400 });
  }

  const session = getLearningSession(excerpt_id);
  if (!session) {
    return NextResponse.json({ error: "No learning session found for this excerpt" }, { status: 404 });
  }

  // Check if already cached
  const cached = getLearningMaterial(excerpt_id, AUDIO_TOOL_TYPE);
  if (cached) {
    const { file_path: cachedPath } = JSON.parse(cached.content) as { file_path: string };
    if (fs.existsSync(cachedPath)) {
      return NextResponse.json({ success: true, file_path: cachedPath });
    }
  }

  // Create audio dir if needed
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const outputPath = path.join(AUDIO_DIR, `excerpt-${excerpt_id}.m4a`);

  const result = await callNotebookLM(
    "generate-audio",
    { output: outputPath },
    { timeout: 300000 }
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  saveLearningMaterial(excerpt_id, AUDIO_TOOL_TYPE, JSON.stringify({ file_path: outputPath }));

  return NextResponse.json({ success: true, file_path: outputPath });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const excerptIdParam = searchParams.get("excerpt_id");

  if (!excerptIdParam) {
    return NextResponse.json({ error: "excerpt_id is required" }, { status: 400 });
  }

  const excerptId = Number(excerptIdParam);
  const cached = getLearningMaterial(excerptId, AUDIO_TOOL_TYPE);

  if (!cached) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  const { file_path: filePath } = JSON.parse(cached.content) as { file_path: string };

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Audio file missing from disk" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "audio/mp4",
      "Content-Length": String(fileBuffer.byteLength),
      "Content-Disposition": `inline; filename="excerpt-${excerptId}.m4a"`,
    },
  });
}
