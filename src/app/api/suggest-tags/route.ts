import { NextRequest, NextResponse } from "next/server";
import { ALL_TAGS, TIER1_DOMAIN, TIER2_TOOLS, TIER3_TOPICS } from "@/lib/tag-vocab";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

function buildVocabBlock(): string {
  const domain = Object.entries(TIER1_DOMAIN)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const tools = (TIER2_TOOLS as readonly string[]).join(", ");
  const topics = (TIER3_TOPICS as readonly string[]).join(", ");

  return `### 领域标签（必选一个）
${domain}

### 工具标签（可选）
${tools}

### 主题标签（可选）
${topics}`;
}

// Validate candidate tag format: lowercase, hyphens, 2-20 chars
function isValidCandidate(tag: string): boolean {
  return /^[a-z][a-z0-9-]{1,19}$/.test(tag);
}

export async function POST(request: NextRequest) {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not configured" }, { status: 500 });
  }

  const { title, content, currentTags } = await request.json();

  const truncatedContent = content?.slice(0, 3000) ?? "";

  const prompt = `你是一个内容标签分类助手。根据以下文章内容，完成两个任务：

## 任务 1：从词表中选标签（1-4 个）

### 标签词表

${buildVocabBlock()}

## 任务 2：如果词表不够描述内容，建议 0-2 个新标签

新标签命名规则：
- 全小写英文，单词间用连字符（如 vector-db、rag、fine-tuning）
- 2-20 个字符
- 不要与词表中已有标签语义重复

## 输出格式

返回一个 JSON 对象（不要其他说明）：
{"tags": ["词表命中的标签"], "candidates": ["建议新增的标签"]}

例如：{"tags": ["ai-coding", "tutorial"], "candidates": ["rag"]}

如果词表已经够用，candidates 为空数组：{"tags": ["agents", "openclaw"], "candidates": []}

## 规则
1. tags 数组只能包含词表中的标签
2. tags 必须包含至少一个领域标签
3. candidates 只在词表确实无法覆盖时才建议
4. 不要重复已有标签

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
          { role: "system", content: "你是一个内容标签分类助手。按要求返回JSON对象，包含tags和candidates两个数组。" },
          { role: "user", content: prompt },
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
          (t: string) => !(currentTags ?? []).includes(t) && ALL_TAGS.includes(t)
        );
        const candidates = (parsed.candidates ?? []).filter(
          (t: string) =>
            !(currentTags ?? []).includes(t) &&
            !ALL_TAGS.includes(t) &&
            isValidCandidate(t)
        );
        return NextResponse.json({ tags: vocabTags, candidates });
      } catch {
        // Fall through to array parsing
      }
    }

    // Fallback: parse as plain array (backward compat)
    const arrMatch = reply.match(/\[[\s\S]*?\]/);
    if (!arrMatch) {
      return NextResponse.json({ error: "Failed to parse response", raw: reply }, { status: 500 });
    }

    const allTags = JSON.parse(arrMatch[0]) as string[];
    const vocabTags = allTags.filter(
      (t: string) => !(currentTags ?? []).includes(t) && ALL_TAGS.includes(t)
    );
    const candidates = allTags.filter(
      (t: string) =>
        !(currentTags ?? []).includes(t) &&
        !ALL_TAGS.includes(t) &&
        isValidCandidate(t)
    );

    return NextResponse.json({ tags: vocabTags, candidates });
  } catch (e) {
    console.error("MiniMax request failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
