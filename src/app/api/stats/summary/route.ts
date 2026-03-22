import { NextRequest, NextResponse } from "next/server";
import { getActivityByDateRange } from "@/lib/db";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

export async function POST(request: NextRequest) {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not configured" }, { status: 500 });
  }

  const { start, end, type } = await request.json();
  if (!start || !end) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  const activities = getActivityByDateRange(start, end);
  const archived = activities.filter((a) => a.action === "archive");

  if (archived.length === 0) {
    return NextResponse.json({ summary: "这段时间没有归档任何内容。" });
  }

  // Build context for AI
  const items = archived.map((a) => {
    let tags: string[] = [];
    try { tags = JSON.parse(a.tags); } catch { /* skip */ }
    return `- ${a.title ?? "Untitled"} [${tags.join(", ")}] (信号: ${a.signal}/5)`;
  }).join("\n");

  const period = type === "weekly" ? "本周" : "今日";
  const prompt = `以下是用户${period}归档的阅读内容列表：

${items}

共归档 ${archived.length} 篇内容。

请用 2-4 句话生成一段简洁的${period}阅读总结，包括：
1. 主要关注了哪些主题/领域
2. 有什么值得注意的趋势或重点
3. 如果有高信号（4-5分）的内容，简要提及

语气轻松专业，像一个助手在帮用户回顾${period}的阅读。直接输出总结，不要加标题或前缀。`;

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
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`MiniMax API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("AI summary failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
