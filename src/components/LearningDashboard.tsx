"use client";

import { useState, useEffect, useCallback } from "react";
import LearningCard from "./LearningCard";
import LearningPanel, { type ExcerptInfo } from "./LearningPanel";

interface LearningDashboardProps {
  onFinish: (id: number) => void;
}

export default function LearningDashboard({ onFinish }: LearningDashboardProps) {
  const [excerpts, setExcerpts] = useState<ExcerptInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadExcerpts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/learning/excerpts");
      if (res.ok) {
        const data = await res.json();
        setExcerpts(data.items as ExcerptInfo[]);
        setTotal(data.total as number);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExcerpts();
  }, [loadExcerpts]);

  // Auto-select first item when list loads
  useEffect(() => {
    if (excerpts.length > 0 && selectedId === null) {
      setSelectedId(excerpts[0].id);
    }
  }, [excerpts, selectedId]);

  function handleFinish(id: number) {
    setExcerpts((prev) => prev.filter((e) => e.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    // Select next item
    const idx = excerpts.findIndex((e) => e.id === id);
    const next = excerpts[idx + 1] ?? excerpts[idx - 1] ?? null;
    setSelectedId(next?.id ?? null);
    onFinish(id);
  }

  const selectedExcerpt = excerpts.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: card list */}
      <div className="w-80 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col">
        {/* List header */}
        <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <span className="text-sm text-[var(--text-secondary)]">
            {loading ? "加载中..." : `${total} 篇待内化`}
          </span>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto">
          {!loading && excerpts.length === 0 && (
            <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm px-4 text-center">
              暂无内化中的文章
            </div>
          )}
          {excerpts.map((excerpt) => (
            <LearningCard
              key={excerpt.id}
              id={excerpt.id}
              title={excerpt.title}
              tags={excerpt.tags}
              progress={excerpt.progress}
              updatedAt={excerpt.updated_at ?? ""}
              selected={selectedId === excerpt.id}
              onClick={() => setSelectedId(excerpt.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: panel */}
      <div className="flex-1 bg-[var(--bg)]">
        <LearningPanel excerpt={selectedExcerpt} onFinish={handleFinish} />
      </div>
    </div>
  );
}
