"use client";

interface TagStat {
  tag: string;
  count: number;
}

interface ArchiveFilterBarProps {
  tagStats: TagStat[];
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  search: string;
  onSearchChange: (search: string) => void;
  totalItems: number;
}

export default function ArchiveFilterBar({
  tagStats,
  selectedTags,
  onSelectedTagsChange,
  search,
  onSearchChange,
  totalItems,
}: ArchiveFilterBarProps) {
  const counts = tagStats.map((t) => t.count);
  const minCount = Math.min(...counts, 1);
  const maxCount = Math.max(...counts, 1);

  function fontSize(count: number): number {
    if (maxCount === minCount) return 16;
    return 12 + ((count - minCount) / (maxCount - minCount)) * 12;
  }

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      onSelectedTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onSelectedTagsChange([...selectedTags, tag]);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] space-y-2">
      {/* Tag cloud + search row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 flex flex-wrap items-center gap-1.5">
          {tagStats.map((t) => (
            <button
              key={t.tag}
              onClick={() => toggleTag(t.tag)}
              style={{ fontSize: `${fontSize(t.count)}px` }}
              className={`px-1.5 py-0.5 rounded transition-colors leading-tight ${
                selectedTags.includes(t.tag)
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)]"
              }`}
            >
              {t.tag}
            </button>
          ))}
          {tagStats.length === 0 && (
            <span className="text-sm text-[var(--text-secondary)]">暂无标签</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[var(--text-secondary)]">{totalItems} 篇</span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索归档..."
            className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-1 text-sm text-[var(--text)] placeholder:text-[var(--text-secondary)]/50 w-48"
          />
        </div>
      </div>

      {/* Selected tags row */}
      {selectedTags.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-secondary)]">已选:</span>
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded text-xs"
            >
              {tag}
              <button
                onClick={() => toggleTag(tag)}
                className="hover:text-white transition-colors"
              >
                {'\u00D7'}
              </button>
            </span>
          ))}
          <button
            onClick={() => onSelectedTagsChange([])}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
          >
            清除
          </button>
        </div>
      )}
    </div>
  );
}
