import fs from "fs";
import path from "path";
import { getExcerptById, updateExcerpt } from "./db";
import { updateFrontmatterFields } from "./frontmatter";
import { TAG_TO_ARCHIVE_TOPIC } from "./tag-vocab";

const ARCHIVE_BASE = "05 Library/0506 已读归档";

const ARCHIVE_TOPIC_MAP: Record<string, string> = {
  "ai-coding": "AI 编码与工作流",
  "agents-skills-mcp": "Agents Skills MCP",
  "pkm-learning": "知识管理与学习",
  "design-frontend": "设计与前端体验",
  "business-product": "商业与产品判断",
  "investing-market": "投资与市场",
  "life-other": "生活与其他",
};

function inferArchiveTopic(
  topic: string | null,
  tags: string[],
  filePath: string
): string {
  // Priority: use tier-1 tag if present
  for (const tag of tags) {
    const mapped = TAG_TO_ARCHIVE_TOPIC[tag.toLowerCase()];
    if (mapped) return mapped;
  }

  // Fallback: keyword matching
  const joined = [topic, tags.join(" "), filePath]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/agent|skill|mcp|openclaw|claude agent/.test(joined))
    return "agents-skills-mcp";
  if (/obsidian|knowledge|学习|笔记|pkm|notebooklm|second brain/.test(joined))
    return "pkm-learning";
  if (/设计|前端|frontend|ui|ux|tailwind|react|css/.test(joined))
    return "design-frontend";
  if (/投资|市场|finance|macro|quant|trading|股票|估值|econom/.test(joined))
    return "investing-market";
  if (
    /商业|产品|创业|增长|strategy|startup|saas|出海|newsletter|report/.test(
      joined
    )
  )
    return "business-product";
  if (
    /claude code|ai编程|ai 编码|编码|开发|工作流|编程|software|developer|engineering|coding/.test(
      joined
    )
  )
    return "ai-coding";
  return "life-other";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function archiveExcerpt(
  vaultPath: string,
  excerptId: number,
  overrides?: {
    tags?: string[];
    signal?: number;
    source_type?: string;
    topic?: string;
  }
): { success: boolean; newPath?: string; error?: string } {
  const excerpt = getExcerptById(excerptId);
  if (!excerpt) {
    return { success: false, error: "Excerpt not found" };
  }

  if (excerpt.location === "archived") {
    return { success: false, error: "Already archived" };
  }

  const oldPath = excerpt.file_path;
  if (!fs.existsSync(oldPath)) {
    return { success: false, error: `Source file not found: ${oldPath}` };
  }

  const archiveDir = path.join(vaultPath, ARCHIVE_BASE);
  fs.mkdirSync(archiveDir, { recursive: true });

  const fileName = path.basename(oldPath);
  let newPath = path.join(archiveDir, fileName);

  // Handle name collision
  if (fs.existsSync(newPath)) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let counter = 1;
    while (fs.existsSync(newPath)) {
      newPath = path.join(archiveDir, `${base}-${counter}${ext}`);
      counter++;
    }
  }

  try {
    const tags = overrides?.tags ?? JSON.parse(excerpt.tags);
    const signal = overrides?.signal ?? excerpt.signal;
    const sourceType = overrides?.source_type ?? excerpt.source_type;
    const topic = overrides?.topic ?? excerpt.topic;
    const archiveTopic = inferArchiveTopic(topic, tags, oldPath);

    updateFrontmatterFields(oldPath, {
      type: "clip",
      status: "已归档",
      tags,
      signal,
      source_type: sourceType ?? undefined,
      topic: topic ?? undefined,
      archive_topic: archiveTopic,
      finished: today(),
    });

    // Move the file
    fs.renameSync(oldPath, newPath);

    // Update SQLite
    updateExcerpt(excerptId, {
      status: "archived",
      location: "archived",
      file_path: newPath,
      tags: JSON.stringify(tags),
      signal: signal,
      source_type: sourceType,
      topic: topic,
    });

    return { success: true, newPath };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export function deleteExcerptFile(
  vaultPath: string,
  excerptId: number
): { success: boolean; error?: string } {
  const excerpt = getExcerptById(excerptId);
  if (!excerpt) {
    return { success: false, error: "Excerpt not found" };
  }

  try {
    if (fs.existsSync(excerpt.file_path)) {
      fs.unlinkSync(excerpt.file_path);
    }
    const { deleteExcerpt: dbDelete } = require("./db");
    dbDelete(excerptId);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
