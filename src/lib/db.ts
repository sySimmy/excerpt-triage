import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "excerpt-triage.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");

    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    _db.exec(schema);
  }
  return _db;
}

export interface ExcerptRow {
  id: number;
  file_path: string;
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
  tags: string; // JSON array
  location: string;
  created_at: string;
  updated_at: string;
}

export function upsertExcerpt(data: Omit<ExcerptRow, "id" | "created_at" | "updated_at">) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO excerpts (file_path, title, source_type, source_name, author, url, published_at, captured_at, topic, signal, status, tags, location)
    VALUES (@file_path, @title, @source_type, @source_name, @author, @url, @published_at, @captured_at, @topic, @signal, @status, @tags, @location)
    ON CONFLICT(file_path) DO UPDATE SET
      title = @title,
      source_type = @source_type,
      source_name = @source_name,
      author = @author,
      url = @url,
      published_at = @published_at,
      captured_at = @captured_at,
      topic = @topic,
      signal = @signal,
      status = @status,
      tags = @tags,
      location = @location,
      updated_at = datetime('now')
  `);
  return stmt.run(data);
}

export function getExcerpts(filters: {
  status?: string;
  source_type?: string;
  signal_min?: number;
  signal_max?: number;
  tag?: string;
  search?: string;
  captured_after?: string;
  sort?: string;
  exclude_archived?: boolean;
  limit?: number;
  offset?: number;
}): { items: ExcerptRow[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.exclude_archived) {
    conditions.push("location != 'archived'");
  }
  if (filters.status) {
    conditions.push("status = @status");
    params.status = filters.status;
  }
  if (filters.source_type) {
    conditions.push("source_type = @source_type");
    params.source_type = filters.source_type;
  }
  if (filters.signal_min !== undefined) {
    conditions.push("signal >= @signal_min");
    params.signal_min = filters.signal_min;
  }
  if (filters.signal_max !== undefined) {
    conditions.push("signal <= @signal_max");
    params.signal_max = filters.signal_max;
  }
  if (filters.tag) {
    conditions.push("tags LIKE @tag");
    params.tag = `%"${filters.tag}"%`;
  }
  if (filters.search) {
    conditions.push("(title LIKE @search OR topic LIKE @search)");
    params.search = `%${filters.search}%`;
  }
  if (filters.captured_after) {
    conditions.push("captured_at >= @captured_after");
    params.captured_after = filters.captured_after;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const orderBy = filters.sort === "random" ? "ORDER BY RANDOM()" : "ORDER BY captured_at DESC, id DESC";

  const total = db.prepare(`SELECT COUNT(*) as count FROM excerpts ${where}`).get(params) as { count: number };
  const items = db.prepare(`SELECT * FROM excerpts ${where} ${orderBy} LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset }) as ExcerptRow[];

  return { items, total: total.count };
}

export function getExcerptById(id: number): ExcerptRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM excerpts WHERE id = ?").get(id) as ExcerptRow | undefined;
}

export function updateExcerpt(id: number, data: Partial<Pick<ExcerptRow, "status" | "signal" | "tags" | "source_type" | "topic" | "location" | "file_path">>) {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = value;
    }
  }
  sets.push("updated_at = datetime('now')");

  if (sets.length === 1) return; // only updated_at, skip

  db.prepare(`UPDATE excerpts SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function deleteExcerpt(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM excerpts WHERE id = ?").run(id);
}

export function getAllTags(): { tag: string; count: number }[] {
  const db = getDb();
  const rows = db.prepare("SELECT tags FROM excerpts WHERE tags != '[]'").all() as { tags: string }[];
  const tagCounts = new Map<string, number>();

  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    } catch {
      // skip malformed
    }
  }

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function getArchivedTags(): { tag: string; count: number }[] {
  const db = getDb();
  const rows = db.prepare("SELECT tags FROM excerpts WHERE location = 'archived' AND tags != '[]'").all() as { tags: string }[];
  const tagCounts = new Map<string, number>();

  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    } catch {
      // skip malformed
    }
  }

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function getArchivedExcerpts(filters: {
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}): { items: ExcerptRow[]; total: number } {
  const db = getDb();
  const conditions: string[] = ["location = 'archived'"];
  const params: Record<string, unknown> = {};

  if (filters.tags && filters.tags.length > 0) {
    filters.tags.forEach((tag, i) => {
      const key = `tag_${i}`;
      conditions.push(`tags LIKE @${key}`);
      params[key] = `%"${tag}"%`;
    });
  }
  if (filters.search) {
    conditions.push("(title LIKE @search OR topic LIKE @search)");
    params.search = `%${filters.search}%`;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;

  const total = db.prepare(`SELECT COUNT(*) as count FROM excerpts ${where}`).get(params) as { count: number };
  const items = db.prepare(
    `SELECT id, title, source_type, source_name, signal, status, published_at, tags FROM excerpts ${where} ORDER BY captured_at DESC, id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset }) as ExcerptRow[];

  return { items, total: total.count };
}

export function getStats(): { total: number; to_process: number; reading: number; read: number; archived: number } {
  const db = getDb();
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM excerpts GROUP BY status").all() as { status: string; count: number }[];
  const stats = { total: 0, to_process: 0, reading: 0, read: 0, archived: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status in stats) {
      (stats as Record<string, number>)[row.status] = row.count;
    }
  }
  return stats;
}
