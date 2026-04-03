"use client";

import { useState, useRef, useEffect } from "react";

interface Filters {
  status: string;
  source_type: string;
  search: string;
  tag: string;
  captured_within: string;
  date_from: string;
  date_to: string;
  date_field: "captured" | "published";
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

function TimeFilter({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isCustom = filters.captured_within === "custom";
  const hasActiveFilter = filters.captured_within !== "";

  function getLabel(): string {
    if (isCustom) {
      const field = filters.date_field === "published" ? "发布" : "收录";
      const parts: string[] = [];
      if (filters.date_from) parts.push(filters.date_from);
      if (filters.date_to) parts.push(filters.date_to);
      if (parts.length === 2) return `${field}: ${parts[0]} ~ ${parts[1]}`;
      if (parts.length === 1) return `${field}: ${filters.date_from ? `${parts[0]}起` : `至${parts[0]}`}`;
      return "自定义时间";
    }
    const presets: Record<string, string> = { "1": "今天", "3": "3天内", "7": "一周内", "30": "一个月内" };
    return presets[filters.captured_within] ?? "全部时间";
  }

  function selectPreset(value: string) {
    onChange({ ...filters, captured_within: value, date_from: "", date_to: "", date_field: "captured" });
    setOpen(false);
  }

  function clearFilter() {
    onChange({ ...filters, captured_within: "", date_from: "", date_to: "", date_field: "captured" });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 bg-[var(--bg-tertiary)] border rounded px-2 py-1 text-sm transition-colors ${
          hasActiveFilter
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--text)]"
        }`}
      >
        <span className="max-w-[200px] truncate">{getLabel()}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md shadow-lg min-w-[280px]">
          {/* Presets */}
          <div className="p-1 border-b border-[var(--border)]">
            <button
              onClick={clearFilter}
              className={`block w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                !hasActiveFilter ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
              }`}
            >
              全部时间
            </button>
            {[
              { value: "1", label: "今天" },
              { value: "3", label: "3天内" },
              { value: "7", label: "一周内" },
              { value: "30", label: "一个月内" },
            ].map((preset) => (
              <button
                key={preset.value}
                onClick={() => selectPreset(preset.value)}
                className={`block w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                  filters.captured_within === preset.value ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="p-3">
            <div className="text-xs text-[var(--text-secondary)] mb-2">自定义范围</div>

            {/* Date field toggle */}
            <div className="flex gap-1 mb-3 bg-[var(--bg-tertiary)] rounded p-0.5">
              <button
                onClick={() => onChange({ ...filters, captured_within: "custom", date_field: "captured" })}
                className={`flex-1 text-xs py-1 rounded transition-colors ${
                  !isCustom || filters.date_field === "captured"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                }`}
              >
                收录日期
              </button>
              <button
                onClick={() => onChange({ ...filters, captured_within: "custom", date_field: "published" })}
                className={`flex-1 text-xs py-1 rounded transition-colors ${
                  isCustom && filters.date_field === "published"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                }`}
              >
                发布日期
              </button>
            </div>

            {/* Date inputs */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => onChange({ ...filters, captured_within: "custom", date_from: e.target.value })}
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] [color-scheme:dark]"
              />
              <span className="text-xs text-[var(--text-secondary)]">~</span>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => onChange({ ...filters, captured_within: "custom", date_to: e.target.value })}
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] [color-scheme:dark]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
      <TimeFilter filters={filters} onChange={onChange} />

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
