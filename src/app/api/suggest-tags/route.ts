import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt, getEffectiveVocab } from "@/lib/tag-optimization";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

function isValidCandidate(tag: string): boolean {
  return /^[a-z][a-z0-9-]{1,19}$/.test(tag);
}

export async function POST(request: NextRequest) {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not configured" }, { status: 500 });
  }

  const { title, content, currentTags } = await request.json();
  const truncatedContent = content?.slice(0, 3000) ?? "";

  // Build effective tag list (static + dynamic)
  const vocab = getEffectiveVocab();
  const effectiveTags = [...vocab.tier1, ...vocab.tier2, ...vocab.tier3];

  const systemPrompt = buildSystemPrompt();

  const userPrompt = `## 输出格式

返回一个 JSON 对象（不要其他说明）：
{"tags": ["词表命中的标签"], "candidates": ["建议新增的标签"]}

## 新标签命名规则
- 全小写英文，单词间用连字符（如 vector-db、rag、fine-tuning）
- 2-20 个字符
- 不要与词表中已有标签语义重复
- candidates 只在词表确实无法覆盖时才建议 0-2 个

## 已有标签（不要重复）
${(currentTags ?? []).join(", ") || "无"}

## 文章标题
${title ?? "无标题"}

## 文章内容
${truncatedContent}`;

  try {
    const res = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("MiniMax API error:", err);
      return NextResponse.json({ error: `MiniMax API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "";

    // Try to parse as {tags, candidates} object first
    const objMatch = reply.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]) as { tags?: string[]; candidates?: string[] };
        const vocabTags = (parsed.tags ?? []).filter(
          (t: string) => !(currentTags ?? []).includes(t) && effectiveTags.includes(t)
        );
        const candidates = (parsed.candidates ?? []).filter(
          (t: string) =>
            !(currentTags ?? []).includes(t) &&
            !effectiveTags.includes(t) &&
            isValidCandidate(t)
        );
        return NextResponse.json({ tags: vocabTags, candidates });
      } catch {
        // Fall through to array parsing
      }
    }

    // Fallback: parse as plain array
    const arrMatch = reply.match(/\[[\s\S]*?\]/);
    if (!arrMatch) {
      return NextResponse.json({ error: "Failed to parse response", raw: reply }, { status: 500 });
    }

    const allTags = JSON.parse(arrMatch[0]) as string[];
    const vocabTags = allTags.filter(
      (t: string) => !(currentTags ?? []).includes(t) && effectiveTags.includes(t)
    );
    const candidates = allTags.filter(
      (t: string) =>
        !(currentTags ?? []).includes(t) &&
        !effectiveTags.includes(t) &&
        isValidCandidate(t)
    );

    return NextResponse.json({ tags: vocabTags, candidates });
  } catch (e) {
    console.error("MiniMax request failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
