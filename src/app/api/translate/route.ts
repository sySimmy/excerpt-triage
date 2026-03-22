import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

const CHUNK_SIZE = 5000; // chars per chunk
const SYSTEM_PROMPT = `你是一个专业的英译中翻译。

翻译目标：在忠实原意的前提下，尽量保留原文的语气、节奏、风格和修辞特色。

具体要求：
1. 不要只翻字面意思，要尽量翻出原文的"感觉"；
2. 若原文是冷静、尖锐、幽默、诗性、克制等风格，中文中也尽量体现；
3. 中文要像原本就是中文写作，而不是生硬的翻译稿；
4. 遇到难以直译的修辞、双关、文化典故，可采用"意译 + 简短注释"；
5. 不要过度本土化，不要把原作者的气质翻没了；
6. 保留原文的 Markdown 格式（标题、列表、代码块、链接等）；
7. 技术术语可以保留英文并在首次出现时用括号注明中文；
8. 直接输出译文，不要加任何说明或翻译难点分析。`;

/**
 * Split content into chunks at paragraph boundaries (double newline).
 * Falls back to splitting at single newline if paragraphs are too large.
 */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary (double newline)
    let splitIdx = remaining.lastIndexOf("\n\n", CHUNK_SIZE);

    // Fallback: single newline
    if (splitIdx < CHUNK_SIZE * 0.3) {
      splitIdx = remaining.lastIndexOf("\n", CHUNK_SIZE);
    }

    // Fallback: hard cut at CHUNK_SIZE
    if (splitIdx < CHUNK_SIZE * 0.3) {
      splitIdx = CHUNK_SIZE;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

async function translateChunk(text: string): Promise<string> {
  const res = await fetch(MINIMAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `请将以下英文内容翻译成中文：\n\n${text}` },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(request: NextRequest) {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not configured" }, { status: 500 });
  }

  const { content } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "No content to translate" }, { status: 400 });
  }

  try {
    const chunks = splitIntoChunks(content);

    // Translate chunks concurrently (max 3 at a time)
    const results: string[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = chunks.slice(i, i + 3);
      const translations = await Promise.all(batch.map(translateChunk));
      results.push(...translations);
    }

    const translation = results.join("\n\n");
    return NextResponse.json({ translation, chunks: chunks.length });
  } catch (e) {
    console.error("MiniMax translate failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
