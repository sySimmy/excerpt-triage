"use client";

import { useState, useEffect, useCallback } from "react";

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDate(dateStr: string): string {
  // "2026-03-22" → "03/22"
  return dateStr.slice(5, 7) + "/" + dateStr.slice(8, 10);
}

interface DailyStats {
  type: "daily";
  date: string;
  newCount: number;
  archived: number;
  deleted: number;
  total: number;
  backlog: number;
  tags: { tag: string; count: number }[];
  articlesByTag: Record<string, { title: string; signal: number; source_type: string | null }[]>;
  activities: { action: string; title: string; source_type: string | null; signal: number; tags: string; created_at: string }[];
}

interface WeeklyStats {
  type: "weekly";
  weekStart: string;
  weekEnd: string;
  totalArchived: number;
  totalDeleted: number;
  totalProcessed: number;
  totalNew: number;
  dailyCounts: { date: string; archived: number; deleted: number }[];
  dailyNewCounts: { date: string; count: number }[];
  backlogHistory: { date: string; total: number }[];
  avgProcessingHours: number | null;
  topTags: { tag: string; count: number }[];
  sourceBreakdown: { source: string; count: number }[];
}

const SOURCE_LABELS: Record<string, string> = {
  rss: "RSS",
  social: "Social",
  article: "Article",
  newsletter: "Newsletter",
  video: "Video",
  report: "Report",
  unknown: "未知",
};

function BarChart({ data, maxVal }: { data: { key: string; value: number; value2?: number; value3?: number }[]; maxVal: number }) {
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-2 text-xs">
          <span className="w-14 text-right text-[var(--text-secondary)] tabular-nums">
            {shortDate(d.key)}
          </span>
          <div className="flex-1 flex items-center gap-0.5 h-5">
            {(d.value3 ?? 0) > 0 && (
              <div
                className="h-full bg-green-500/50 rounded-sm"
                style={{ width: `${Math.max(2, ((d.value3 ?? 0) / maxVal) * 100)}%` }}
              />
            )}
            {d.value > 0 && (
              <div
                className="h-full bg-[var(--accent)] rounded-sm"
                style={{ width: `${Math.max(2, (d.value / maxVal) * 100)}%` }}
              />
            )}
            {(d.value2 ?? 0) > 0 && (
              <div
                className="h-full bg-red-500/60 rounded-sm"
                style={{ width: `${Math.max(2, ((d.value2 ?? 0) / maxVal) * 100)}%` }}
              />
            )}
          </div>
          <span className="w-24 text-right tabular-nums text-[11px]">
            {(d.value3 ?? 0) > 0 && <span className="text-green-400">+{d.value3} </span>}
            <span className="text-[var(--accent)]">{d.value}</span>
            {(d.value2 ?? 0) > 0 && <span className="text-red-400">+{d.value2}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function BacklogChart({ data }: { data: { date: string; total: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.total), 1);
  const min = Math.min(...data.map((d) => d.total));
  const range = Math.max(max - min, 1);
  const chartH = 100;

  return (
    <div className="mt-2">
      <div className="flex items-end gap-1" style={{ height: chartH }}>
        {data.map((d) => {
          const h = Math.max(4, ((d.total - min + range * 0.1) / (range * 1.2)) * chartH);
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end">
              <div className="text-[10px] text-[var(--text-secondary)] tabular-nums mb-1">{d.total}</div>
              <div
                className="w-full bg-yellow-500/40 rounded-t-sm"
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d) => (
          <div key={d.date} className="flex-1 text-center text-[10px] text-[var(--text-secondary)]">
            {shortDate(d.date)}
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalStars({ value }: { value: number }) {
  return (
    <span className="text-yellow-500 text-xs">
      {"★".repeat(value)}
      {"☆".repeat(Math.max(0, 5 - value))}
    </span>
  );
}

export default function StatsView() {
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [dailyData, setDailyData] = useState<DailyStats | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()));

  const loadDaily = useCallback(async (date: string) => {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch(`/api/stats?type=daily&date=${date}`);
      if (res.ok) setDailyData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWeekly = useCallback(async () => {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch("/api/stats?type=weekly");
      if (res.ok) setWeeklyData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "daily") loadDaily(selectedDate);
    else loadWeekly();
  }, [mode, selectedDate, loadDaily, loadWeekly]);

  async function generateSummary() {
    setSummaryLoading(true);
    try {
      let start: string, end: string;
      if (mode === "daily") {
        start = selectedDate;
        const d = new Date(selectedDate + "T00:00:00");
        d.setDate(d.getDate() + 1);
        end = localDate(d);
      } else {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        start = localDate(d);
        const t = new Date();
        t.setDate(t.getDate() + 1);
        end = localDate(t);
      }

      const res = await fetch("/api/stats/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, type: mode }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } finally {
      setSummaryLoading(false);
    }
  }

  function navigateDate(offset: number) {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(localDate(d));
  }

  const today = localDate(new Date());

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-5">
        {/* Mode toggle */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-0.5">
            <button
              onClick={() => setMode("daily")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                mode === "daily" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text)]"
              }`}
            >
              日报
            </button>
            <button
              onClick={() => setMode("weekly")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                mode === "weekly" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text)]"
              }`}
            >
              周报
            </button>
          </div>

          {mode === "daily" && (
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => navigateDate(-1)} className="px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                &larr;
              </button>
              <span className="text-[var(--text)] tabular-nums">{selectedDate}</span>
              <button
                onClick={() => navigateDate(1)}
                disabled={selectedDate >= today}
                className="px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-30"
              >
                &rarr;
              </button>
              {selectedDate !== today && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="text-xs text-[var(--accent)] hover:underline ml-1"
                >
                  今天
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center text-[var(--text-secondary)] py-20">加载中...</div>
        ) : mode === "daily" && dailyData ? (
          <DailyView data={dailyData} summary={summary} summaryLoading={summaryLoading} onGenerateSummary={generateSummary} />
        ) : mode === "weekly" && weeklyData ? (
          <WeeklyView data={weeklyData} summary={summary} summaryLoading={summaryLoading} onGenerateSummary={generateSummary} />
        ) : (
          <div className="text-center text-[var(--text-secondary)] py-20">暂无数据</div>
        )}
      </div>
    </div>
  );
}

function DailyView({ data, summary, summaryLoading, onGenerateSummary }: {
  data: DailyStats;
  summary: string | null;
  summaryLoading: boolean;
  onGenerateSummary: () => void;
}) {
  const archivedItems = data.activities.filter((a) => a.action === "archive");
  const deletedItems = data.activities.filter((a) => a.action === "delete");

  if (data.total === 0 && (data.newCount ?? 0) === 0) {
    return (
      <div className="text-center text-[var(--text-secondary)] py-20">
        <p className="text-lg mb-1">这天没有任何活动</p>
        <p className="text-sm">归档或删除文章后，数据会出现在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="新增" value={data.newCount ?? 0} color="var(--green)" />
        <StatCard label="归档" value={data.archived} color="var(--accent)" />
        <StatCard label="删除" value={data.deleted} color="var(--red)" />
        <StatCard label="待处理" value={data.backlog} color="var(--yellow)" />
      </div>

      {/* AI Summary */}
      {data.total > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">AI 总结</span>
            <button
              onClick={onGenerateSummary}
              disabled={summaryLoading}
              className="px-3 py-1 text-xs bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded hover:bg-purple-600/30 transition-colors disabled:opacity-50"
            >
              {summaryLoading ? "生成中..." : summary ? "重新生成" : "生成总结"}
            </button>
          </div>
          {summary && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{summary}</p>
          )}
        </div>
      )}

      {/* Tag breakdown */}
      {data.tags.length > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">标签分布</h3>
          <div className="flex flex-wrap gap-2">
            {data.tags.map((t) => (
              <span key={t.tag} className="px-2.5 py-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-full">
                {t.tag} <span className="text-[var(--text-secondary)]">{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Archived articles by tag */}
      {archivedItems.length > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">归档内容 ({archivedItems.length})</h3>
          <div className="space-y-4">
            {Object.entries(data.articlesByTag).map(([tag, articles]) => (
              <div key={tag}>
                <div className="text-xs font-medium text-[var(--accent)] mb-1.5">{tag}</div>
                <div className="space-y-1">
                  {articles.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-[var(--text-secondary)]">{a.title}</span>
                      <SignalStars value={a.signal} />
                      {a.source_type && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
                          {SOURCE_LABELS[a.source_type] ?? a.source_type}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deleted articles */}
      {deletedItems.length > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">删除内容 ({deletedItems.length})</h3>
          <div className="space-y-1">
            {deletedItems.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/60 flex-shrink-0" />
                <span className="flex-1 truncate text-[var(--text-secondary)]">{a.title ?? "Untitled"}</span>
                {a.source_type && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
                    {SOURCE_LABELS[a.source_type] ?? a.source_type}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyView({ data, summary, summaryLoading, onGenerateSummary }: {
  data: WeeklyStats;
  summary: string | null;
  summaryLoading: boolean;
  onGenerateSummary: () => void;
}) {
  if (data.totalProcessed === 0 && (data.totalNew ?? 0) === 0) {
    return (
      <div className="text-center text-[var(--text-secondary)] py-20">
        <p className="text-lg mb-1">本周还没有任何活动</p>
        <p className="text-sm">归档或删除文章后，数据会出现在这里</p>
      </div>
    );
  }

  // Merge daily counts with new counts for the chart
  const newCountMap = new Map((data.dailyNewCounts ?? []).map((d) => [d.date, d.count]));
  const chartData = data.dailyCounts.map((d) => ({
    key: d.date,
    value: d.archived,
    value2: d.deleted,
    value3: newCountMap.get(d.date) ?? 0,
  }));
  const maxDaily = Math.max(
    ...data.dailyCounts.map((d) => d.archived + d.deleted),
    ...(data.dailyNewCounts ?? []).map((d) => d.count),
    1
  );

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="新增" value={data.totalNew ?? 0} color="var(--green)" />
        <StatCard label="总处理" value={data.totalProcessed} color="var(--text)" />
        <StatCard label="归档" value={data.totalArchived} color="var(--accent)" />
        <StatCard label="删除" value={data.totalDeleted} color="var(--red)" />
        <StatCard
          label="平均处理时间"
          value={data.avgProcessingHours != null ? `${data.avgProcessingHours}h` : "-"}
          color="var(--yellow)"
        />
      </div>

      {/* AI Summary */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">AI 周报总结</span>
          <button
            onClick={onGenerateSummary}
            disabled={summaryLoading}
            className="px-3 py-1 text-xs bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded hover:bg-purple-600/30 transition-colors disabled:opacity-50"
          >
            {summaryLoading ? "生成中..." : summary ? "重新生成" : "生成总结"}
          </button>
        </div>
        {summary && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{summary}</p>
        )}
      </div>

      {/* Daily trend */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3">每日趋势</h3>
        <BarChart data={chartData} maxVal={maxDaily} />
        <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-500/50 rounded-sm inline-block" /> 新增</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[var(--accent)] rounded-sm inline-block" /> 归档</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-500/60 rounded-sm inline-block" /> 删除</span>
        </div>
      </div>

      {/* Backlog trend */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <h3 className="text-sm font-medium mb-1">待处理积压趋势</h3>
        <BacklogChart data={data.backlogHistory} />
      </div>

      {/* Top tags + Source breakdown side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">热门标签</h3>
          <div className="space-y-1.5">
            {data.topTags.slice(0, 10).map((t) => (
              <div key={t.tag} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">{t.tag}</span>
                <div className="w-20 h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full"
                    style={{ width: `${(t.count / (data.topTags[0]?.count || 1)) * 100}%` }}
                  />
                </div>
                <span className="w-5 text-right text-[var(--text-secondary)] tabular-nums">{t.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">来源分布</h3>
          <div className="space-y-1.5">
            {data.sourceBreakdown.map((s) => (
              <div key={s.source} className="flex items-center gap-2 text-xs">
                <span className="flex-1">{SOURCE_LABELS[s.source] ?? s.source}</span>
                <div className="w-20 h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500/60 rounded-full"
                    style={{ width: `${(s.count / (data.sourceBreakdown[0]?.count || 1)) * 100}%` }}
                  />
                </div>
                <span className="w-5 text-right text-[var(--text-secondary)] tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3 text-center">
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</div>
    </div>
  );
}
