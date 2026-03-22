"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TagEditor from "./TagEditor";
import SignalRating from "./SignalRating";

interface ExcerptDetail {
  id: number;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  author: string | null;
  url: string | null;
  published_at: string | null;
  signal: number;
  status: string;
  tags: string; // JSON
  topic: string | null;
  content: string;
  location: string;
}

interface ReadingPanelProps {
  excerptId: number | null;
  tagSuggestions: string[];
  onArchived?: () => void;
  onDeleted?: () => void;
  onNext?: () => void;
  archiveMode?: boolean;
}

const SOURCE_OPTIONS = [
  { value: "rss", label: "RSS" },
  { value: "social", label: "Social" },
  { value: "article", label: "Article" },
  { value: "newsletter", label: "Newsletter" },
  { value: "video", label: "Video" },
  { value: "report", label: "Report" },
];

export default function ReadingPanel({ excerptId, tagSuggestions, onArchived, onDeleted, onNext, archiveMode }: ReadingPanelProps) {
  const [excerpt, setExcerpt] = useState<ExcerptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [signal, setSignal] = useState(0);
  const [sourceType, setSourceType] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);

  // Detect if content is mostly English
  function isEnglishContent(text: string): boolean {
    if (!text) return false;
    // Count CJK characters vs total alphanumeric
    const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
    const ascii = text.match(/[a-zA-Z]/g)?.length ?? 0;
    if (ascii === 0) return false;
    return cjk / (cjk + ascii) < 0.15;
  }

  // Translate content
  async function handleTranslate() {
    if (!excerpt || translating) return;
    if (translation) {
      setShowTranslation(!showTranslation);
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: excerpt.content }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslation(data.translation);
        setShowTranslation(true);
        // Save translation to file
        await fetch(`/api/excerpts/${excerptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translation: data.translation }),
        });
      }
    } finally {
      setTranslating(false);
    }
  }

  // AI tag suggestion
  async function handleSuggestTags() {
    if (!excerpt || suggesting) return;
    setSuggesting(true);
    setCandidates([]);
    try {
      const res = await fetch("/api/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: excerpt.title,
          content: excerpt.content,
          currentTags: tags,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tags?.length > 0) {
          setTags((prev) => [...prev, ...data.tags]);
        }
        if (data.candidates?.length > 0) {
          setCandidates(data.candidates);
        }
      }
    } finally {
      setSuggesting(false);
    }
  }

  function acceptCandidate(candidate: string) {
    setTags((prev) => [...prev, candidate]);
    setCandidates((prev) => prev.filter((c) => c !== candidate));
  }

  function dismissCandidate(candidate: string) {
    setCandidates((prev) => prev.filter((c) => c !== candidate));
  }

  // Load excerpt
  useEffect(() => {
    if (!excerptId) {
      setExcerpt(null);
      return;
    }
    setLoading(true);
    setTranslation(null);
    setShowTranslation(false);
    setCandidates([]);
    fetch(`/api/excerpts/${excerptId}`)
      .then((r) => r.json())
      .then((data) => {
        setExcerpt(data);
        try {
          setTags(JSON.parse(data.tags));
        } catch {
          setTags([]);
        }
        setSignal(data.signal ?? 0);
        setSourceType(data.source_type ?? "");
      })
      .finally(() => setLoading(false));
  }, [excerptId]);

  // Auto-save on tag/signal/sourceType change
  const saveChanges = useCallback(async () => {
    if (!excerptId) return;
    await fetch(`/api/excerpts/${excerptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags, signal, source_type: sourceType }),
    });
  }, [excerptId, tags, signal, sourceType]);

  useEffect(() => {
    if (!excerpt) return;
    const timer = setTimeout(saveChanges, 500);
    return () => clearTimeout(timer);
  }, [tags, signal, sourceType, saveChanges, excerpt]);

  // Archive
  async function handleArchive() {
    if (!excerptId || archiving) return;
    setArchiving(true);
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: excerptId, tags, signal, source_type: sourceType }),
      });
      if (res.ok) {
        onArchived?.();
        onNext?.();
      }
    } finally {
      setArchiving(false);
    }
  }

  // Delete
  async function handleDelete() {
    if (!excerptId || deleting) return;
    if (!confirm("确定删除这篇文章？文件将被永久删除。")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/archive", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: excerptId }),
      });
      if (res.ok) {
        onDeleted?.();
        onNext?.();
      }
    } finally {
      setDeleting(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (archiveMode) {
        // In archive mode, only allow rating and tag shortcuts
        if (e.key >= "1" && e.key <= "5") {
          setSignal(Number(e.key));
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          handleSuggestTags();
        }
        return;
      }
      if (e.key === "Enter" && excerptId && excerpt?.location !== "archived") {
        e.preventDefault();
        handleArchive();
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onNext?.();
      } else if (e.key >= "1" && e.key <= "5") {
        setSignal(Number(e.key));
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        handleSuggestTags();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excerptId, tags, signal, sourceType, excerpt]);

  if (!excerptId) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        <div className="text-center">
          <p className="text-lg mb-2">选择一篇文章开始阅读</p>
          <p className="text-sm">← 从左侧列表中选择</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        加载中...
      </div>
    );
  }

  if (!excerpt) return null;

  const isArchived = excerpt.location === "archived";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <h2 className="text-base font-semibold truncate">{excerpt.title ?? "Untitled"}</h2>
        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)]">
          {excerpt.source_name && <span>{excerpt.source_name}</span>}
          {excerpt.author && <span>by {excerpt.author}</span>}
          {excerpt.published_at && <span>{excerpt.published_at.slice(0, 10)}</span>}
          {excerpt.url && (
            <a href={excerpt.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
              原文链接
            </a>
          )}
          {isArchived && (
            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">已归档</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Translate bar - only show for English content */}
        {isEnglishContent(excerpt.content) && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[var(--border)]">
            <span className="text-xs text-[var(--text-secondary)]">检测到英文内容</span>
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="px-2.5 py-1 text-xs bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded hover:bg-orange-500/30 transition-colors disabled:opacity-50"
            >
              {translating ? "翻译中（长文分段翻译）..." : translation ? (showTranslation ? "显示原文" : "显示翻译") : "翻译全文"}
            </button>
          </div>
        )}

        <div className="markdown-content max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...props }) => (
                <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>
              ),
            }}
          >
            {showTranslation && translation ? translation : excerpt.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] space-y-2.5">
        {/* Tags */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TagEditor tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </div>
          <button
            onClick={handleSuggestTags}
            disabled={suggesting}
            className="flex-shrink-0 px-3 py-1.5 text-sm bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded hover:bg-purple-600/30 transition-colors disabled:opacity-50"
          >
            {suggesting ? "推荐中..." : "AI 推荐"}
          </button>
        </div>

        {/* Candidate tags (vocab-external suggestions) */}
        {candidates.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-secondary)]">候选标签：</span>
            {candidates.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs border border-dashed border-yellow-500/40 text-yellow-300/80 rounded">
                {c}
                <button
                  onClick={() => acceptCandidate(c)}
                  className="hover:text-green-400 transition-colors"
                  title="采纳"
                >
                  ✓
                </button>
                <button
                  onClick={() => dismissCandidate(c)}
                  className="hover:text-red-400 transition-colors"
                  title="忽略"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center gap-4">
          {/* Source type - hidden in archive mode */}
          {!archiveMode && (
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
            >
              <option value="">分类</option>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {/* Signal */}
          <SignalRating value={signal} onChange={setSignal} />

          <div className="flex-1" />

          {/* Actions */}
          <span className="text-xs text-[var(--text-secondary)]">
            {archiveMode
              ? "1-5 评分 · T AI标签 · E 编辑标签"
              : "S 跳过 · Enter 归档 · D 删除 · 1-5 评分 · T AI标签"}
          </span>

          {!archiveMode && (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-sm bg-[var(--bg-tertiary)] border border-red-900/50 rounded hover:bg-red-900/30 text-red-400 transition-colors disabled:opacity-50"
              >
                {deleting ? "删除中..." : "删除"}
              </button>

              <button
                onClick={onNext}
                className="px-3 py-1.5 text-sm bg-[var(--bg-tertiary)] border border-[var(--border)] rounded hover:bg-[var(--border)] transition-colors"
              >
                跳过
              </button>

              {!isArchived && (
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {archiving ? "归档中..." : "归档 →"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
