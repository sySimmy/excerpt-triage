import { NextResponse } from "next/server";
import { getOptimizationHistory } from "@/lib/tag-optimization";

export async function GET() {
  const history = getOptimizationHistory();
  return NextResponse.json(history);
}
