import { NextResponse } from "next/server";
import { getEffectiveVocab, getDynamicVocabRows } from "@/lib/tag-optimization";

export async function GET() {
  const vocab = getEffectiveVocab();
  const dynamicRows = getDynamicVocabRows();
  return NextResponse.json({
    ...vocab,
    dynamicAdditions: dynamicRows
      .filter((r) => r.action === "add")
      .map(({ tag, tier, reason }) => ({ tag, tier, reason })),
    dynamicRemovals: dynamicRows
      .filter((r) => r.action === "remove")
      .map(({ tag, tier, reason }) => ({ tag, tier, reason })),
  });
}
