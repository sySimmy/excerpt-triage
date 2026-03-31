import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { expandSourceTypeFilter } from "@/lib/inbox-filters";

const DB_DIR = path.join(process.cwd(), ".nosync");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);
const DB_PATH = path.join(DB_DIR, "excerpt-triage.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");

    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    _db.exec(schema);

    // One-time migration: normalize captured_at to ISO date format (YYYY-MM-DD)
    migrateCapturedAtDates(_db);
  }
  return _db;
}

function migrateCapturedAtDates(db: Database.Database) {
  const rows = db.prepare(
    "SELECT id, captured_at FROM excerpts WHERE captured_at IS NOT NULL AND captured_at NOT LIKE '____-__-__%'"
  ).all() as { id: number; captured_at: string }[];

  if (rows.length === 0) return;

  const update = db.prepare("UPDATE excerpts SET captured_at = @captured_at WHERE id = @id");
  const tx = db.transaction(() => {
    for (const row of rows) {
      const d = new Date(row.captured_at);
      if (!isNaN(d.getTime())) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        update.run({ id: row.id, captured_at: iso });
      }
    }
  });
  tx();
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
      source_type = COALESCE(excerpts.source_type, @source_type),
      source_name = @source_name,
      author = @author,
      url = @url,
      published_at = @published_at,
      captured_at = @captured_at,
      topic = @topic,
      signal = CASE WHEN excerpts.signal > 0 THEN excerpts.signal ELSE @signal END,
      status = CASE WHEN excerpts.status IN ('deep_read', 'archived') THEN excerpts.status ELSE @status END,
      tags = CASE WHEN excerpts.tags != '[]' THEN excerpts.tags ELSE @tags END,
      location = CASE WHEN excerpts.location = 'archived' THEN excerpts.location ELSE @location END,
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
  exclude_deep_read?: boolean;
  limit?: number;
  offset?: number;
}): { items: ExcerptRow[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.exclude_archived) {
    conditions.push("location != 'archived'");
  }
  if (filters.exclude_deep_read) {
    conditions.push("status != 'deep_read'");
  }
  if (filters.status) {
    conditions.push("status = @status");
    params.status = filters.status;
  }
  if (filters.source_type) {
    const sourceTypes = expandSourceTypeFilter(filters.source_type);
    if (sourceTypes.length === 1) {
      conditions.push("source_type = @source_type");
      params.source_type = sourceTypes[0];
    } else {
      const placeholders = sourceTypes.map((sourceType, index) => {
        const key = `source_type_${index}`;
        params[key] = sourceType;
        return `@${key}`;
      });
      conditions.push(`source_type IN (${placeholders.join(", ")})`);
    }
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
    conditions.push("COALESCE(captured_at, date(created_at)) >= @captured_after");
    params.captured_after = filters.captured_after;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const orderBy = filters.sort === "random" ? "ORDER BY RANDOM()" : "ORDER BY COALESCE(captured_at, date(created_at)) DESC, id DESC";

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

// === Activity Log ===

export interface ActivityRow {
  id: number;
  excerpt_id: number | null;
  action: string;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  tags: string;
  signal: number;
  created_at: string;
}

export function logActivity(data: {
  excerpt_id: number;
  action: string;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  tags: string;
  signal: number;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO activity_log (excerpt_id, action, title, source_type, source_name, tags, signal, created_at)
     VALUES (@excerpt_id, @action, @title, @source_type, @source_name, @tags, @signal, datetime('now', 'localtime'))`
  ).run(data);
}

export function getActivityByDateRange(start: string, end: string): ActivityRow[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM activity_log WHERE created_at >= @start AND created_at < @end ORDER BY created_at DESC`
  ).all({ start, end }) as ActivityRow[];
}

export function getDailyNewCounts(days: number): { date: string; count: number }[] {
  const db = getDb();
  return db.prepare(
    `SELECT date(created_at, 'localtime') as date, COUNT(*) as count
     FROM excerpts
     WHERE date(created_at, 'localtime') >= date('now', 'localtime', @offset)
     GROUP BY date(created_at, 'localtime')
     ORDER BY date ASC`
  ).all({ offset: `-${days} days` }) as { date: string; count: number }[];
}

export function getNewCountForDate(date: string, nextDate: string): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM excerpts WHERE datetime(created_at, 'localtime') >= @date AND datetime(created_at, 'localtime') < @nextDate`
  ).get({ date, nextDate }) as { count: number };
  return row.count;
}

export function getDailyActivityCounts(days: number): { date: string; archived: number; deleted: number }[] {
  const db = getDb();
  return db.prepare(
    `SELECT date(created_at) as date,
            SUM(CASE WHEN action = 'archive' THEN 1 ELSE 0 END) as archived,
            SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END) as deleted
     FROM activity_log
     WHERE created_at >= date('now', 'localtime', @offset)
     GROUP BY date(created_at)
     ORDER BY date ASC`
  ).all({ offset: `-${days} days` }) as { date: string; archived: number; deleted: number }[];
}

export function getBacklogHistory(days: number): { date: string; total: number }[] {
  const db = getDb();
  // Approximate: current backlog + reverse-apply daily changes
  const currentBacklog = (db.prepare(
    `SELECT COUNT(*) as count FROM excerpts WHERE location != 'archived'`
  ).get() as { count: number }).count;

  const dailyCounts = getDailyActivityCounts(days);
  const result: { date: string; total: number }[] = [];

  // Work backwards from today
  let backlog = currentBacklog;

  function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Build map of daily net changes
  const changeMap = new Map<string, number>();
  for (const dc of dailyCounts) {
    // Each archive/delete reduces backlog, so going backwards we add them back
    changeMap.set(dc.date, dc.archived + dc.deleted);
  }

  // Generate dates for the range
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = localDateStr(d);
    result.push({ date: dateStr, total: 0 });
  }

  // Fill backwards
  let runningBacklog = currentBacklog;
  for (let i = result.length - 1; i >= 0; i--) {
    result[i].total = runningBacklog;
    const change = changeMap.get(result[i].date) ?? 0;
    runningBacklog += change; // reverse: processed items were in backlog before
  }

  return result;
}

// === Tag Feedback ===

export interface TagFeedbackRow {
  id: number;
  excerpt_id: number;
  title: string | null;
  tags_before_ai: string;
  ai_suggested: string;
  ai_candidates: string;
  accepted_candidates: string;
  dismissed_candidates: string;
  user_added: string;
  user_removed: string;
  final_tags: string;
  created_at: string;
}

export function saveTagFeedback(data: {
  excerpt_id: number;
  title: string | null;
  tags_before_ai: string[];
  ai_suggested: string[];
  ai_candidates: string[];
  accepted_candidates: string[];
  dismissed_candidates: string[];
  user_added: string[];
  user_removed: string[];
  final_tags: string[];
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO tag_feedback (excerpt_id, title, tags_before_ai, ai_suggested, ai_candidates, accepted_candidates, dismissed_candidates, user_added, user_removed, final_tags, created_at)
     VALUES (@excerpt_id, @title, @tags_before_ai, @ai_suggested, @ai_candidates, @accepted_candidates, @dismissed_candidates, @user_added, @user_removed, @final_tags, datetime('now', 'localtime'))`
  ).run({
    excerpt_id: data.excerpt_id,
    title: data.title,
    tags_before_ai: JSON.stringify(data.tags_before_ai),
    ai_suggested: JSON.stringify(data.ai_suggested),
    ai_candidates: JSON.stringify(data.ai_candidates),
    accepted_candidates: JSON.stringify(data.accepted_candidates),
    dismissed_candidates: JSON.stringify(data.dismissed_candidates),
    user_added: JSON.stringify(data.user_added),
    user_removed: JSON.stringify(data.user_removed),
    final_tags: JSON.stringify(data.final_tags),
  });
}

export function getTagFeedbackAll(): TagFeedbackRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM tag_feedback ORDER BY created_at DESC").all() as TagFeedbackRow[];
}

export function getTagFeedbackAnalysis(): {
  totalSessions: number;
  aiUsedSessions: number;
  avgPrecision: number;
  avgRecall: number;
  tagStats: Record<string, { suggested: number; kept: number; removed: number; missedThenAdded: number }>;
  candidateStats: { total: number; accepted: number; dismissed: number };
  recentCorrections: { title: string | null; ai_suggested: string[]; user_removed: string[]; user_added: string[]; created_at: string }[];
  frequentUserAdds: { tag: string; count: number }[];
  frequentAiRemoves: { tag: string; count: number }[];
} {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tag_feedback ORDER BY created_at DESC").all() as TagFeedbackRow[];

  const tagStats: Record<string, { suggested: number; kept: number; removed: number; missedThenAdded: number }> = {};
  let totalPrecision = 0;
  let totalRecall = 0;
  let aiUsedSessions = 0;
  let totalCandidates = 0;
  let acceptedCandidates = 0;
  let dismissedCandidates = 0;
  const userAddCounts = new Map<string, number>();
  const aiRemoveCounts = new Map<string, number>();
  const recentCorrections: { title: string | null; ai_suggested: string[]; user_removed: string[]; user_added: string[]; created_at: string }[] = [];

  for (const row of rows) {
    const aiSuggested = JSON.parse(row.ai_suggested) as string[];
    const finalTags = JSON.parse(row.final_tags) as string[];
    const userAdded = JSON.parse(row.user_added) as string[];
    const userRemoved = JSON.parse(row.user_removed) as string[];
    const accepted = JSON.parse(row.accepted_candidates) as string[];
    const dismissed = JSON.parse(row.dismissed_candidates) as string[];

    if (aiSuggested.length === 0) continue;
    aiUsedSessions++;

    // Per-tag stats
    const aiKept = aiSuggested.filter(t => finalTags.includes(t));
    const aiRejected = aiSuggested.filter(t => !finalTags.includes(t));

    for (const tag of aiSuggested) {
      if (!tagStats[tag]) tagStats[tag] = { suggested: 0, kept: 0, removed: 0, missedThenAdded: 0 };
      tagStats[tag].suggested++;
      if (aiKept.includes(tag)) tagStats[tag].kept++;
      if (aiRejected.includes(tag)) tagStats[tag].removed++;
    }
    for (const tag of userAdded) {
      if (!tagStats[tag]) tagStats[tag] = { suggested: 0, kept: 0, removed: 0, missedThenAdded: 0 };
      tagStats[tag].missedThenAdded++;
      userAddCounts.set(tag, (userAddCounts.get(tag) ?? 0) + 1);
    }
    for (const tag of userRemoved) {
      aiRemoveCounts.set(tag, (aiRemoveCounts.get(tag) ?? 0) + 1);
    }

    // Precision: what fraction of AI suggestions were kept
    const precision = aiSuggested.length > 0 ? aiKept.length / aiSuggested.length : 1;
    // Recall: what fraction of final tags (excluding pre-existing) were suggested by AI
    const newFinalTags = finalTags.filter(t => {
      const before = JSON.parse(row.tags_before_ai) as string[];
      return !before.includes(t);
    });
    const recall = newFinalTags.length > 0 ? aiKept.length / newFinalTags.length : 1;

    totalPrecision += precision;
    totalRecall += recall;

    // Candidate stats
    totalCandidates += accepted.length + dismissed.length;
    acceptedCandidates += accepted.length;
    dismissedCandidates += dismissed.length;

    // Recent corrections (up to 20)
    if (recentCorrections.length < 20 && (userRemoved.length > 0 || userAdded.length > 0)) {
      recentCorrections.push({
        title: row.title,
        ai_suggested: aiSuggested,
        user_removed: userRemoved,
        user_added: userAdded,
        created_at: row.created_at,
      });
    }
  }

  const frequentUserAdds = Array.from(userAddCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const frequentAiRemoves = Array.from(aiRemoveCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalSessions: rows.length,
    aiUsedSessions,
    avgPrecision: aiUsedSessions > 0 ? totalPrecision / aiUsedSessions : 0,
    avgRecall: aiUsedSessions > 0 ? totalRecall / aiUsedSessions : 0,
    tagStats,
    candidateStats: { total: totalCandidates, accepted: acceptedCandidates, dismissed: dismissedCandidates },
    recentCorrections,
    frequentUserAdds,
    frequentAiRemoves,
  };
}

export function getDeepReadExcerpts(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): { items: ExcerptRow[]; total: number } {
  const db = getDb();
  const conditions: string[] = ["status = 'deep_read'", "location != 'archived'"];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    conditions.push("(title LIKE @search OR topic LIKE @search)");
    params.search = `%${filters.search}%`;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;

  const total = db.prepare(`SELECT COUNT(*) as count FROM excerpts ${where}`).get(params) as { count: number };
  const items = db.prepare(
    `SELECT * FROM excerpts ${where} ORDER BY updated_at DESC, id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset }) as ExcerptRow[];

  return { items, total: total.count };
}

export function getStats(): { total: number; to_process: number; reading: number; read: number; archived: number; deep_read: number } {
  const db = getDb();
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM excerpts GROUP BY status").all() as { status: string; count: number }[];
  const stats = { total: 0, to_process: 0, reading: 0, read: 0, archived: 0, deep_read: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status in stats) {
      (stats as Record<string, number>)[row.status] = row.count;
    }
  }
  return stats;
}
