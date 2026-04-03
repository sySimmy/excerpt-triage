"use client";

interface LearningCardProps {
  id: number;
  title: string | null;
  tags: string; // JSON string
  progress: number; // 0-5
  updatedAt: string;
  selected: boolean;
  onClick: () => void;
}

function progressColor(progress: number): string {
  if (progress === 0) return "bg-blue-500";
  if (progress <= 3) return "bg-amber-500";
  return "bg-green-500";
}

export default function LearningCard({
  title,
  tags: tagsJson,
  progress,
  updatedAt,
  selected,
  onClick,
}: LearningCardProps) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(tagsJson);
  } catch {
    tags = [];
  }

  const visibleTags = tags.slice(0, 3);
  const overflow = tags.length - visibleTags.length;
  const pct = Math.round((progress / 5) * 100);
  const dateStr = updatedAt ? updatedAt.slice(0, 10) : "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-[var(--border)] transition-colors ${
        selected
          ? "bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]"
          : "hover:bg-[var(--bg-secondary)]"
      }`}
    >
      {/* Title */}
      <div className="text-sm font-medium text-[var(--text)] truncate mb-1.5">
        {title ?? "Untitled"}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] rounded"
            >
              {tag}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[10px] text-[var(--text-secondary)]">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor(progress)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">
          {progress}/5
        </span>
      </div>

      {/* Date */}
      {dateStr && (
        <div className="text-[10px] text-[var(--text-secondary)] mt-1">
          {dateStr}
        </div>
      )}
    </button>
  );
}
