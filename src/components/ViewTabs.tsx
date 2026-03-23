"use client";

export type ViewKey = "inbox" | "deep-read" | "archive" | "stats" | "tag-feedback";

interface ViewTabsProps {
  activeView: ViewKey;
  onChange: (view: ViewKey) => void;
  deepReadCount?: number;
}

const TABS: { key: ViewKey; label: string }[] = [
  { key: "inbox", label: "收件箱" },
  { key: "deep-read", label: "精读" },
  { key: "archive", label: "归档" },
  { key: "stats", label: "统计" },
  { key: "tag-feedback", label: "AI 标签" },
];

export default function ViewTabs({ activeView, onChange, deepReadCount }: ViewTabsProps) {
  return (
    <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)]">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-5 py-2 text-sm font-medium transition-colors relative ${
            activeView === tab.key
              ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text)]"
          }`}
        >
          {tab.label}
          {tab.key === "deep-read" && deepReadCount != null && deepReadCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-400">
              {deepReadCount}
            </span>
          )}
          {activeView === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
          )}
        </button>
      ))}
    </div>
  );
}
