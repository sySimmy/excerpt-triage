"use client";

interface ViewTabsProps {
  activeView: "inbox" | "archive";
  onChange: (view: "inbox" | "archive") => void;
}

export default function ViewTabs({ activeView, onChange }: ViewTabsProps) {
  return (
    <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)]">
      <button
        onClick={() => onChange("inbox")}
        className={`px-5 py-2 text-sm font-medium transition-colors relative ${
          activeView === "inbox"
            ? "text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text)]"
        }`}
      >
        收件箱
        {activeView === "inbox" && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
        )}
      </button>
      <button
        onClick={() => onChange("archive")}
        className={`px-5 py-2 text-sm font-medium transition-colors relative ${
          activeView === "archive"
            ? "text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text)]"
        }`}
      >
        归档
        {activeView === "archive" && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
        )}
      </button>
    </div>
  );
}
