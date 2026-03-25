import { NextResponse } from "next/server";
import { checkOptimizationTrigger } from "@/lib/tag-optimization";

export async function GET() {
  const result = checkOptimizationTrigger();
  return NextResponse.json(result);
}
