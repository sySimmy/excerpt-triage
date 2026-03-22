"use client";

import { useState } from "react";
import { TIER1_DOMAIN } from "@/lib/tag-vocab";

interface ArchiveItem {
  id: number;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  signal: number;
  status: string;
  published_at: string | null;
  tags: string;
}

interface Group {
  key: string;
  label: string;
  items: ArchiveItem[];
}

interface ArchiveGroupListProps {
  items: ArchiveItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClearFilters?: () => void;
  hasFilters: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  rss: "RSS",
  social: "Social",
  article: "Web",
  newsletter: "NL",
  video: "Video",
  report: "Report",
};

function groupItems(items: ArchiveItem[]): Group[] {
  const tier1Keys = Object.keys(TIER1_DOMAIN);
  const groupMap = new Map<string, ArchiveItem[]>();

  // Initialize groups in tier-1 order
  for (const key of tier1Keys) {
    groupMap.set(key, []);
  }
  groupMap.set("uncategorized", []);

  for (const item of items) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(item.tags);
    } catch {
      // skip
    }

    const matchedTier1 = tier1Keys.filter((k) => tags.includes(k));
    if (matchedTier1.length === 0) {
      groupMap.get("uncategorized")!.push(item);
    } else {
      for (const key of matchedTier1) {
        groupMap.get(key)!.push(item);
      }
    }
  }

  const groups: Group[] = [];
  for (const [key, groupItems] of groupMap) {
    if (groupItems.length === 0) continue;
    const label =
      key === "uncategorized"
        ? "未分类"
        : `${key} — ${TIER1_DOMAIN[key]}`;
    groups.push({ key, label, items: groupItems });
  }

  return groups;
}

export default function ArchiveGroupList({
  items,
  selectedId,
  onSelect,
  onClearFilters,
  hasFilters,
}: ArchiveGroupListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = groupItems(items);

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        <div className="text-center">
          <p className="text-sm mb-2">
            {hasFilters ? "没有同时包含这些标签的文章" : "还没有归档文章"}
          </p>
          {hasFilters && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>
    );
  }

  // Deduplicated total
  const uniqueIds = new Set(items.map((i) => i.id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-1.5 text-xs text-[var(--text-secondary)] border-b border-[var(--border)]">
        共 {uniqueIds.size} 篇文章
      </div>
      {groups.map((group) => (
        <div key={group.key}>
          {/* Group header */}
          <button
            onClick={() => toggleCollapse(group.key)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors border-b border-[var(--border)]"
          >
            <span className="text-xs">{collapsed.has(group.key) ? "\u25B8" : "\u25BE"}</span>
            <span>{group.label}</span>
            <span className="text-xs">({group.items.length})</span>
          </button>

          {/* Group items */}
          {!collapsed.has(group.key) &&
            group.items.map((item) => (
              <button
                key={`${group.key}-${item.id}`}
                onClick={() => onSelect(item.id)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--border)] transition-colors flex items-center gap-2 ${
                  selectedId === item.id
                    ? "bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]"
                    : "hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                {/* Source badge */}
                {item.source_type && (
                  <span className="flex-shrink-0 text-xs px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    {SOURCE_LABELS[item.source_type] ?? item.source_type}
                  </span>
                )}

                {/* Title */}
                <span className="flex-1 truncate">
                  {item.title ?? "Untitled"}
                </span>

                {/* Signal */}
                {item.signal > 0 && (
                  <span className="flex-shrink-0 text-xs text-yellow-500">
                    {"\u2605".repeat(item.signal)}
                  </span>
                )}

                {/* Date */}
                {item.published_at && (
                  <span className="flex-shrink-0 text-xs text-[var(--text-secondary)]">
                    {item.published_at.slice(5, 10)}
                  </span>
                )}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
