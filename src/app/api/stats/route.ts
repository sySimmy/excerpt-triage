import { NextRequest, NextResponse } from "next/server";
import { getActivityByDateRange, getDailyActivityCounts, getDailyNewCounts, getNewCountForDate, getBacklogHistory, getDb } from "@/lib/db";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return localDateStr(new Date());
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

function nextDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return localDateStr(next);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "daily"; // daily or weekly

  if (type === "daily") {
    const date = searchParams.get("date") ?? todayStr();
    const nextDate = nextDateStr(date);

    // Activity log for the day
    const activities = getActivityByDateRange(date, nextDate);

    // Counts
    const archived = activities.filter((a) => a.action === "archive").length;
    const deleted = activities.filter((a) => a.action === "delete").length;

    // Tag breakdown from archived items
    const tagCounts = new Map<string, number>();
    const articlesByTag = new Map<string, { title: string; signal: number; source_type: string | null }[]>();
    for (const a of activities.filter((a) => a.action === "archive")) {
      try {
        const tags = JSON.parse(a.tags) as string[];
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          if (!articlesByTag.has(tag)) articlesByTag.set(tag, []);
          articlesByTag.get(tag)!.push({ title: a.title ?? "Untitled", signal: a.signal, source_type: a.source_type });
        }
        if (tags.length === 0) {
          const key = "未分类";
          tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
          if (!articlesByTag.has(key)) articlesByTag.set(key, []);
          articlesByTag.get(key)!.push({ title: a.title ?? "Untitled", signal: a.signal, source_type: a.source_type });
        }
      } catch {
        // skip
      }
    }

    // Current backlog
    const db = getDb();
    const backlog = (db.prepare("SELECT COUNT(*) as count FROM excerpts WHERE location != 'archived'").get() as { count: number }).count;

    // New items captured today
    const newCount = getNewCountForDate(date, nextDate);

    return NextResponse.json({
      type: "daily",
      date,
      newCount,
      archived,
      deleted,
      total: archived + deleted,
      backlog,
      tags: Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
      articlesByTag: Object.fromEntries(articlesByTag),
      activities: activities.map((a) => ({
        action: a.action,
        title: a.title,
        source_type: a.source_type,
        signal: a.signal,
        tags: a.tags,
        created_at: a.created_at,
      })),
    });
  }

  // Weekly
  const days = 7;
  const dailyCounts = getDailyActivityCounts(days);
  const dailyNewCounts = getDailyNewCounts(days);
  const backlogHistory = getBacklogHistory(days);

  // Weekly totals
  const weekStart = daysAgoStr(6);
  const weekActivities = getActivityByDateRange(weekStart, tomorrowStr());
  const weekArchived = weekActivities.filter((a) => a.action === "archive");

  // Top tags this week
  const tagCounts = new Map<string, number>();
  for (const a of weekArchived) {
    try {
      const tags = JSON.parse(a.tags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    } catch {
      // skip
    }
  }

  // Source type breakdown
  const sourceCounts = new Map<string, number>();
  for (const a of weekArchived) {
    const src = a.source_type ?? "unknown";
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }

  // Avg processing time (captured_at to archived created_at)
  const db = getDb();
  let avgProcessingHours: number | null = null;
  try {
    const result = db.prepare(
      `SELECT AVG(
        (julianday(al.created_at) - julianday(e.captured_at)) * 24
      ) as avg_hours
      FROM activity_log al
      JOIN excerpts e ON al.excerpt_id = e.id
      WHERE al.action = 'archive'
        AND al.created_at >= @weekStart
        AND e.captured_at IS NOT NULL`
    ).get({ weekStart }) as { avg_hours: number | null };
    avgProcessingHours = result?.avg_hours ? Math.round(result.avg_hours) : null;
  } catch {
    // table may not have data yet
  }

  return NextResponse.json({
    type: "weekly",
    weekStart,
    weekEnd: todayStr(),
    totalArchived: weekArchived.length,
    totalDeleted: weekActivities.filter((a) => a.action === "delete").length,
    totalProcessed: weekActivities.length,
    dailyCounts,
    dailyNewCounts,
    backlogHistory,
    avgProcessingHours,
    totalNew: dailyNewCounts.reduce((sum, d) => sum + d.count, 0),
    topTags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    sourceBreakdown: Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  });
}
