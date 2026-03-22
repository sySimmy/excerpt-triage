"use client";

interface ViewTabsProps {
  activeView: "inbox" | "archive" | "stats" | "tag-feedback";
  onChange: (view: "inbox" | "archive" | "stats" | "tag-feedback") => void;
}

const TABS: { key: "inbox" | "archive" | "stats" | "tag-feedback"; label: string }[] = [
  { key: "inbox", label: "收件箱" },
  { key: "archive", label: "归档" },
  { key: "stats", label: "统计" },
  { key: "tag-feedback", label: "AI 标签" },
];

export default function ViewTabs({ activeView, onChange }: ViewTabsProps) {
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
          {activeView === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
          )}
        </button>
      ))}
    </div>
  );
}
