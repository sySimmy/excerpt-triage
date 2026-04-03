import { NextRequest, NextResponse } from "next/server";
import {
  getLearningSession,
  getLearningMaterial,
  saveLearningMaterial,
} from "@/lib/db";
import { callNotebookLM } from "@/lib/notebooklm";

const VALID_TOOL_TYPES = ["summary", "quiz", "flashcard"] as const;
type ToolType = typeof VALID_TOOL_TYPES[number];

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { excerpt_id, tool_type } = body as { excerpt_id: number; tool_type: string };

  if (!excerpt_id || !tool_type) {
    return NextResponse.json({ error: "excerpt_id and tool_type are required" }, { status: 400 });
  }

  if (!VALID_TOOL_TYPES.includes(tool_type as ToolType)) {
    return NextResponse.json({ error: "tool_type must be summary, quiz, or flashcard" }, { status: 400 });
  }

  // Check cache
  const cached = getLearningMaterial(excerpt_id, tool_type);
  if (cached) {
    return NextResponse.json({ success: true, content: JSON.parse(cached.content) });
  }

  const session = getLearningSession(excerpt_id);
  if (!session) {
    return NextResponse.json({ error: "No learning session found for this excerpt" }, { status: 404 });
  }

  const sourceId = session.notebooklm_source_id;
  const timeout = tool_type === "summary" ? 30000 : 60000;

  let result;
  if (tool_type === "summary") {
    result = await callNotebookLM("guide", { "source-id": sourceId }, { timeout });
  } else {
    const typeArg = tool_type === "flashcard" ? "flashcards" : tool_type;
    result = await callNotebookLM("generate", { type: typeArg, "source-id": sourceId }, { timeout });
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const content = result.content ?? result;
  saveLearningMaterial(excerpt_id, tool_type, JSON.stringify(content));

  return NextResponse.json({ success: true, content });
}
