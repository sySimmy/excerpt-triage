"use client";

interface Filters {
  status: string;
  source_type: string;
  search: string;
  tag: string;
  captured_within: string;
  sort: string;
  _randomSeed: number;
}

interface Stats {
  total: number;
  to_process: number;
  reading: number;
  read: number;
  archived: number;
  deep_read: number;
}

interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  stats: Stats | null;
  tagOptions: Array<{ value: string; label: string; count?: number }>;
}

export default function FilterBar({ filters, onChange, stats, tagOptions }: FilterBarProps) {
  const processed = stats ? stats.archived + stats.read : 0;
  const total = stats?.total ?? 0;
  const isRandom = filters.sort === "random";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Progress */}
      <div className="flex items-center gap-2 text-sm mr-2">
        <span className="text-[var(--text-secondary)]">
          {processed}/{total} 已处理
        </span>
        {total > 0 && (
          <div className="w-24 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--green)] rounded-full transition-all"
              style={{ width: `${(processed / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-[var(--border)]" />

      {/* Status filter */}
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
      >
        <option value="">全部状态</option>
        <option value="to_process">未读 {stats ? `(${stats.to_process})` : ""}</option>
        <option value="reading">在读 {stats ? `(${stats.reading})` : ""}</option>
        <option value="read">已读 {stats ? `(${stats.read})` : ""}</option>
      </select>

      {/* Source type filter */}
      <select
        value={filters.source_type}
        onChange={(e) => onChange({ ...filters, source_type: e.target.value })}
        className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
      >
        <option value="">全部来源</option>
        <option value="rss">RSS</option>
        <option value="social">Social</option>
        <option value="article">Article</option>
        <option value="newsletter">Newsletter</option>
        <option value="video">Video</option>
        <option value="report">Report</option>
      </select>

      {/* Tag filter */}
      <select
        value={filters.tag}
        onChange={(e) => onChange({ ...filters, tag: e.target.value })}
        className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
      >
        <option value="">全部标签</option>
        {tagOptions.map((tag) => (
          <option key={tag.value} value={tag.value}>
            {tag.count ? `${tag.label} (${tag.count})` : tag.label}
          </option>
        ))}
      </select>

      {/* Time range filter */}
      <select
        value={filters.captured_within}
        onChange={(e) => onChange({ ...filters, captured_within: e.target.value })}
        className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
      >
        <option value="">全部时间</option>
        <option value="1">今天</option>
        <option value="3">3天内</option>
        <option value="7">一周内</option>
        <option value="30">一个月内</option>
      </select>

      {/* Search */}
      <input
        type="text"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="搜索标题/主题..."
        className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-1 text-sm text-[var(--text)] placeholder:text-[var(--text-secondary)]/50 max-w-xs"
      />

      {/* Shuffle toggle */}
      {isRandom ? (
        <span className="inline-flex items-center gap-0.5">
          <button
            onClick={() => onChange({ ...filters, _randomSeed: Date.now() })}
            title="换一批"
            className="px-2 py-1 text-sm border border-r-0 rounded-l bg-[var(--accent)] border-[var(--accent)] text-white transition-colors hover:brightness-110"
          >
            {'\u{1F500}'}
          </button>
          <button
            onClick={() => onChange({ ...filters, sort: "recent", _randomSeed: 0 })}
            title="退出随机"
            className="px-1.5 py-1 text-sm rounded-r bg-[var(--accent)] border border-[var(--accent)] text-white/70 hover:text-white transition-colors"
          >
            {'\u00D7'}
          </button>
        </span>
      ) : (
        <button
          onClick={() => onChange({ ...filters, sort: "random", _randomSeed: Date.now() })}
          title="随机排序"
          className="px-2 py-1 text-sm border rounded bg-[var(--bg-tertiary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
        >
          {'\u{1F500}'}
        </button>
      )}

      {/* Sync button */}
      <button
        onClick={async () => {
          await fetch("/api/sync", { method: "POST" });
          window.location.reload();
        }}
        className="px-3 py-1 text-sm bg-[var(--bg-tertiary)] border border-[var(--border)] rounded hover:bg-[var(--border)] transition-colors text-[var(--text-secondary)]"
      >
        重新扫描
      </button>
    </div>
  );
}
