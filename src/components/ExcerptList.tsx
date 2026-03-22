"use client";

import { useCallback, useRef, useEffect } from "react";

interface ExcerptItem {
  id: number;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  signal: number;
  status: string;
  published_at: string | null;
}

interface ExcerptListProps {
  items: ExcerptItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  to_process: "bg-gray-500",
  reading: "bg-blue-500",
  read: "bg-yellow-500",
  archived: "bg-green-500",
};

const SOURCE_LABELS: Record<string, string> = {
  rss: "RSS",
  social: "Social",
  article: "Web",
  newsletter: "NL",
  video: "Video",
  report: "Report",
};

function formatDate(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 10);
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default function ExcerptList({ items, selectedId, onSelect, onLoadMore, hasMore, loading }: ExcerptListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      onLoadMore();
    }
  }, [loading, hasMore, onLoadMore]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div ref={listRef} className="h-full overflow-y-auto">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] transition-colors ${
            selectedId === item.id
              ? "bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]"
              : "hover:bg-[var(--bg-tertiary)] border-l-2 border-l-transparent"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[item.status] ?? "bg-gray-500"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-[var(--text)]">
                {item.title ?? "Untitled"}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-secondary)]">
                <span className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded">
                  {SOURCE_LABELS[item.source_type ?? ""] ?? item.source_type ?? "?"}
                </span>
                {item.signal > 0 && (
                  <span className="text-yellow-400/70">{stars(item.signal)}</span>
                )}
                <span>{formatDate(item.published_at)}</span>
              </div>
            </div>
          </div>
        </button>
      ))}

      {loading && (
        <div className="p-4 text-center text-sm text-[var(--text-secondary)]">加载中...</div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="p-4 text-center text-xs text-[var(--text-secondary)]">已到底部</div>
      )}

      {!loading && items.length === 0 && (
        <div className="p-8 text-center text-sm text-[var(--text-secondary)]">没有找到文件</div>
      )}
    </div>
  );
}
