import { NextResponse } from "next/server";
import { getTagFeedbackAnalysis } from "@/lib/db";

export async function GET() {
  const analysis = getTagFeedbackAnalysis();
  return NextResponse.json(analysis);
}
