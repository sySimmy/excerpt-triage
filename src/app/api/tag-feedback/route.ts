import { NextRequest, NextResponse } from "next/server";
import { saveTagFeedback, getTagFeedbackAll } from "@/lib/db";

export async function POST(request: NextRequest) {
  const data = await request.json();
  saveTagFeedback(data);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const rows = getTagFeedbackAll();
  return NextResponse.json(rows);
}
