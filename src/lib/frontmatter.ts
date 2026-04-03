import matter from "gray-matter";
import fs from "fs";

export interface FrontmatterData {
  type?: string;
  title?: string;
  source_type?: string;
  source_name?: string;
  source?: string;
  author?: string;
  url?: string;
  published?: string;
  published_at?: string;
  captured?: string;
  lang?: string;
  topic?: string;
  signal?: number | string;
  related_project?: string;
  status?: string;
  tags?: string[];
  [key: string]: unknown;
}

export function parseFrontmatter(filePath: string): { data: FrontmatterData; content: string } {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return { data: data as FrontmatterData, content };
}

export function writeFrontmatter(filePath: string, data: FrontmatterData, content: string) {
  const output = matter.stringify(content, data);
  fs.writeFileSync(filePath, output, "utf-8");
}

export function updateFrontmatterFields(filePath: string, updates: Partial<FrontmatterData>) {
  const { data, content } = parseFrontmatter(filePath);
  const merged = { ...data, ...updates };
  // Strip undefined values — YAML cannot serialize them
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }
  writeFrontmatter(filePath, merged, content);
}

/**
 * Normalize frontmatter from different sources (RSS vs Social) into a consistent format.
 */
export function normalizeFrontmatter(data: FrontmatterData, filePath: string): {
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  author: string | null;
  url: string | null;
  published_at: string | null;
  captured_at: string | null;
  topic: string | null;
  signal: number;
  status: string;
  tags: string[];
} {
  // Determine source_type from path and frontmatter
  let source_type = data.source_type ?? null;
  if (!source_type) {
    if (filePath.includes("/RSS/")) source_type = "rss";
    else if (filePath.includes("/Social/")) source_type = "social";
    else if (filePath.includes("/Newsletter/")) source_type = "newsletter";
    else if (filePath.includes("/Audio-Video/")) source_type = "video";
    else if (filePath.includes("/Reports-Papers/")) source_type = "report";
    else if (filePath.includes("/Web/")) source_type = "article";
    else source_type = "article";
  }

  // Normalize title
  const title = data.title ?? null;

  // Normalize source_name
  const source_name = data.source_name ?? data.source ?? null;

  // Normalize dates — ensure ISO format (YYYY-MM-DD)
  const published_at = data.published_at ?? data.published ?? null;
  const rawCaptured = data.captured ?? null;
  let captured_at: string | null = null;
  if (rawCaptured) {
    const d = new Date(String(rawCaptured));
    if (!isNaN(d.getTime())) {
      captured_at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else {
      captured_at = String(rawCaptured);
    }
  }

  // Normalize signal
  let signal = 0;
  if (typeof data.signal === "number") signal = data.signal;
  else if (typeof data.signal === "string") signal = parseInt(data.signal, 10) || 0;

  // Normalize status
  const STATUS_MAP: Record<string, string> = {
    "待读": "to_process",
    "在读": "reading",
    "已读": "read",
    "已读待沉淀": "read",
    "精读": "deep_read",
    "内化": "learning",
    "已归档": "archived",
  };
  const rawStatus = data.status ?? "to_process";
  const status = STATUS_MAP[rawStatus] ?? rawStatus;

  // Normalize tags
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];

  return {
    title,
    source_type,
    source_name,
    author: data.author ?? null,
    url: data.url ?? null,
    published_at: published_at ? String(published_at) : null,
    captured_at: captured_at ? String(captured_at) : null,
    topic: data.topic ?? null,
    signal,
    status,
    tags,
  };
}
