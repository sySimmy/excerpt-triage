import { NextRequest, NextResponse } from "next/server";
import {
  getLearningSession,
  updateConversationId,
  getLearningMaterial,
  saveLearningMaterial,
} from "@/lib/db";
import { callNotebookLM } from "@/lib/notebooklm";

interface QAEntry {
  question: string;
  answer: string;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { excerpt_id, question } = body as { excerpt_id: number; question: string };

  if (!excerpt_id || !question) {
    return NextResponse.json({ error: "excerpt_id and question are required" }, { status: 400 });
  }

  const session = getLearningSession(excerpt_id);
  if (!session) {
    return NextResponse.json({ error: "No learning session found for this excerpt" }, { status: 404 });
  }

  const args: Record<string, string> = { question };
  if (session.conversation_id) {
    args["conversation-id"] = session.conversation_id;
  }

  const result = await callNotebookLM("ask", args);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const answer = result.answer as string;
  const convId = result.conversation_id as string | undefined;

  // If first ask and we got a conversation_id, persist it
  if (!session.conversation_id && convId) {
    updateConversationId(excerpt_id, convId);
  }

  // Append to Q&A history in learning_materials
  const QA_TOOL_TYPE = "qa_history";
  const existing = getLearningMaterial(excerpt_id, QA_TOOL_TYPE);
  const history: QAEntry[] = existing ? (JSON.parse(existing.content) as QAEntry[]) : [];
  history.push({ question, answer, timestamp: new Date().toISOString() });
  saveLearningMaterial(excerpt_id, QA_TOOL_TYPE, JSON.stringify(history));

  return NextResponse.json({ success: true, answer });
}
