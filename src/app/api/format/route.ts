import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import matter from "gray-matter";
import { getExcerptById } from "@/lib/db";
import { isMinimaxConfigured, minimaxChat } from "@/lib/minimax";

const NOISE_PROMPT = `你是一个网页噪音检测器。用户会给你一篇带行号的 Markdown 文档。

你的唯一任务：识别哪些行是网页抓取噪音（不是文章正文），返回要删除的行号范围。

## 噪音类型
- 网站导航菜单（Home, About, Contact, 首页, 关于）
- 侧边栏（相关文章、推荐阅读、广告）
- 页脚（版权声明、Copyright、隐私政策）
- 订阅/注册表单（Subscribe, Sign up, newsletter）
- 社交分享按钮（Tweet, Share, Post）
- 重复的作者简介块
- 评论区提示（Disqus, comments）
- 课程推广、付费墙
- 登录墙（Log in, Sign up to see）
- Cookie 提示
- 无意义的单词行（仅含 "Home" "Menu" "Search" 等）

## 不是噪音（必须保留）
- 文章正文段落
- 文章标题和小节标题
- 开头的元数据块（来源、作者、时间）
- 代码块、图片引用
- 空行（不要标记空行）

## 输出格式
返回 JSON：{"delete": [[起始行号, 结束行号], ...]}
没有噪音：{"delete": []}
整篇抓取失败（404、登录页）：{"failed": true}

只返回 JSON。`;

/** Programmatic markdown cleanup — no AI, no content modification */
function cleanMarkdown(text: string, title: string | null): string {
  const lines = text.split("\n");
  const result: string[] = [];

  // Detect if first heading duplicates the title
  const titleNorm = title?.trim().toLowerCase();
  let removedDupTitle = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Remove duplicate title (first # heading matching the document title)
    if (!removedDupTitle && /^#{1,2}\s+/.test(trimmed) && titleNorm) {
      const headingText = trimmed.replace(/^#{1,2}\s+/, "").trim().toLowerCase();
      if (headingText === titleNorm) {
        removedDupTitle = true;
        continue;
      }
    }

    result.push(line);
  }

  // Collapse 3+ consecutive blank lines → 1
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of result) {
    if (line.trim() === "") {
      blankCount++;
      if (blankCount <= 1) collapsed.push(line);
    } else {
      blankCount = 0;
      collapsed.push(line);
    }
  }

  // Ensure blank line before headings
  const final: string[] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const line = collapsed[i];
    if (/^#{1,4}\s/.test(line.trim()) && i > 0 && collapsed[i - 1].trim() !== "") {
      final.push("");
    }
    final.push(line);
  }

  // Trim leading/trailing blank lines
  let start = 0;
  while (start < final.length && final[start].trim() === "") start++;
  let end = final.length - 1;
  while (end > start && final[end].trim() === "") end--;

  return final.slice(start, end + 1).join("\n");
}

export async function POST(request: NextRequest) {
  if (!isMinimaxConfigured()) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not configured" }, { status: 500 });
  }

  const { id } = await request.json();

  const excerpt = getExcerptById(id);
  if (!excerpt) {
    return NextResponse.json({ error: "Excerpt not found" }, { status: 404 });
  }

  if (!fs.existsSync(excerpt.file_path)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const raw = fs.readFileSync(excerpt.file_path, "utf-8");
  const { data: frontmatterData, content } = matter(raw);

  if (!content.trim()) {
    return NextResponse.json({ error: "No content to format" }, { status: 400 });
  }

  const lines = content.split("\n");

  try {
    // === Step 1: AI identifies noise lines ===
    const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
    const truncated = numbered.length > 10000 ? numbered.slice(0, 10000) + "\n..." : numbered;

    const reply = await minimaxChat({
      messages: [
        { role: "system", content: NOISE_PROMPT },
        { role: "user", content: `请分析以下内容，标记噪音行号：\n\n${truncated}` },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { delete?: number[][]; failed?: boolean };

    // Handle scrape failure
    if (parsed.failed) {
      const failContent = lines.slice(0, 20).join("\n") + "\n\n---\n\n[内容抓取失败，请手动查看原文链接]";
      return NextResponse.json({ success: true, content: failContent, original: content.trim(), linesRemoved: 0, totalLines: lines.length });
    }

    // Remove noise lines
    const deleteSet = new Set<number>();
    for (const range of parsed.delete ?? []) {
      const [start, end] = range;
      for (let i = start; i <= end && i <= lines.length; i++) {
        deleteSet.add(i);
      }
    }

    const cleaned = lines.filter((_, i) => !deleteSet.has(i + 1)).join("\n");

    // === Step 2: Programmatic formatting (no AI, content-safe) ===
    const formatted = cleanMarkdown(cleaned, excerpt.title);

    // Don't overwrite the original file — return formatted content for preview only
    return NextResponse.json({
      success: true,
      content: formatted,
      original: content.trim(),
      linesRemoved: deleteSet.size,
      totalLines: lines.length,
    });
  } catch (e) {
    console.error("MiniMax format failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
