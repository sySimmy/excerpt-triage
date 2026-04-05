import { NextRequest, NextResponse } from "next/server";
import { getLearningMaterial } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const excerptIdParam = searchParams.get("excerpt_id");
  const toolType = searchParams.get("tool_type");

  if (!excerptIdParam || !toolType) {
    return NextResponse.json({ error: "excerpt_id and tool_type are required" }, { status: 400 });
  }

  const excerptId = Number(excerptIdParam);
  const material = getLearningMaterial(excerptId, toolType);

  if (!material) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({ exists: true, content: JSON.parse(material.content) });
}
