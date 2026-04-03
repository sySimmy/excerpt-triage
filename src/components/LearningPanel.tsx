"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SummaryView from "./SummaryView";
import QuizView from "./QuizView";
import FlashcardView from "./FlashcardView";
import QAView from "./QAView";

export interface ExcerptInfo {
  id: number;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  author: string | null;
  url: string | null;
  published_at: string | null;
  tags: string;
  progress: number;
  updated_at: string;
}

type ToolType = "summary" | "quiz" | "flashcard" | "audio" | "qa";
type TabKey = ToolType | "original";

interface TabInfo {
  key: TabKey;
  label: string;
  isTool: boolean;
}

const TABS: TabInfo[] = [
  { key: "original", label: "原文", isTool: false },
  { key: "summary", label: "摘要", isTool: true },
  { key: "quiz", label: "测验", isTool: true },
  { key: "flashcard", label: "记忆卡", isTool: true },
  { key: "audio", label: "播客", isTool: true },
  { key: "qa", label: "问答", isTool: true },
];

interface MaterialCache {
  summary: { text: string; keywords: string[] } | null;
  quiz: { questions: { question: string; options: string[]; answer: number; explanation: string }[] } | null;
  flashcard: { cards: { front: string; back: string }[] } | null;
  audio: { file_path: string } | null;
  qa: { question: string; answer: string; timestamp: string }[] | null;
}

const EMPTY_CACHE: MaterialCache = {
  summary: null,
  quiz: null,
  flashcard: null,
  audio: null,
  qa: null,
};

interface LearningPanelProps {
  excerpt: ExcerptInfo | null;
  onFinish: (id: number) => void;
}

export default function LearningPanel({ excerpt, onFinish }: LearningPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("original");
  const [materials, setMaterials] = useState<MaterialCache>(EMPTY_CACHE);
  const [generated, setGenerated] = useState<Set<ToolType>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [originalContent, setOriginalContent] = useState<string>("");

  // Load all cached materials when excerpt changes
  useEffect(() => {
    if (!excerpt) {
      setMaterials(EMPTY_CACHE);
      setGenerated(new Set());
      setAudioUrl(null);
      return;
    }

    setMaterials(EMPTY_CACHE);
    setGenerated(new Set());
    setAudioUrl(null);
    setOriginalContent("");
    setActiveTab("original");

    // Load original content
    fetch(`/api/excerpts/${excerpt.id}`)
      .then((r) => r.json())
      .then((data) => setOriginalContent(data.content ?? ""))
      .catch(() => setOriginalContent(""));

    const toolTypes: ToolType[] = ["summary", "quiz", "flashcard", "audio", "qa"];
    const qaToolType = "qa_history"; // stored under different key

    async function loadAll() {
      const results = await Promise.allSettled([
        fetch(`/api/learning/material?excerpt_id=${excerpt!.id}&tool_type=summary`).then((r) => r.json()),
        fetch(`/api/learning/material?excerpt_id=${excerpt!.id}&tool_type=quiz`).then((r) => r.json()),
        fetch(`/api/learning/material?excerpt_id=${excerpt!.id}&tool_type=flashcard`).then((r) => r.json()),
        fetch(`/api/learning/material?excerpt_id=${excerpt!.id}&tool_type=audio`).then((r) => r.json()),
        fetch(`/api/learning/material?excerpt_id=${excerpt!.id}&tool_type=${qaToolType}`).then((r) => r.json()),
      ]);

      const newMaterials = { ...EMPTY_CACHE };
      const newGenerated = new Set<ToolType>();

      results.forEach((result, i) => {
        const key = toolTypes[i];
        if (result.status === "fulfilled" && result.value.exists) {
          if (key === "summary") newMaterials.summary = result.value.content as MaterialCache["summary"];
          else if (key === "quiz") newMaterials.quiz = result.value.content as MaterialCache["quiz"];
          else if (key === "flashcard") newMaterials.flashcard = result.value.content as MaterialCache["flashcard"];
          else if (key === "audio") newMaterials.audio = result.value.content as MaterialCache["audio"];
          else if (key === "qa") newMaterials.qa = result.value.content as MaterialCache["qa"];
          newGenerated.add(key);
        }
      });

      setMaterials(newMaterials);
      setGenerated(newGenerated);

      // Build audio URL if audio is cached
      if (newGenerated.has("audio")) {
        setAudioUrl(`/api/learning/audio-download?excerpt_id=${excerpt!.id}`);
      }
    }

    loadAll();
  }, [excerpt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate(toolType: ToolType) {
    if (!excerpt || generating) return;
    setGenerating(true);
    try {
      if (toolType === "audio") {
        const res = await fetch("/api/learning/audio-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excerpt_id: excerpt.id }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setAudioUrl(`/api/learning/audio-download?excerpt_id=${excerpt.id}`);
            setGenerated((prev) => new Set([...prev, "audio"]));
            setMaterials((prev) => ({ ...prev, audio: { file_path: data.file_path as string } }));
          }
        }
      } else {
        const res = await fetch("/api/learning/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excerpt_id: excerpt.id, tool_type: toolType }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setGenerated((prev) => new Set([...prev, toolType]));
            setMaterials((prev) => ({ ...prev, [toolType]: data.content }));
          }
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleFinish() {
    if (!excerpt || archiving) return;
    setArchiving(true);
    try {
      const res = await fetch("/api/learning/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excerpt_id: excerpt.id }),
      });
      if (res.ok) {
        onFinish(excerpt.id);
      }
    } finally {
      setArchiving(false);
    }
  }

  if (!excerpt) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        <div className="text-center">
          <p className="text-lg mb-2">选择一篇文章开始内化</p>
          <p className="text-sm">← 从左侧列表中选择</p>
        </div>
      </div>
    );
  }

  const progressCount = generated.size;

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
            <a
              href={excerpt.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              原文链接
            </a>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        {TABS.map((tab) => {
          const isGenerated = tab.isTool && generated.has(tab.key as ToolType);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
              {isGenerated && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              )}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "original" && (
          <div className="h-full overflow-y-auto px-5 py-4">
            <div className="markdown-content max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>
                  ),
                  img: ({ src, ...props }) => src ? <img src={src} {...props} /> : null,
                }}
              >
                {originalContent}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {activeTab === "summary" && (
          materials.summary ? (
            <SummaryView content={materials.summary} />
          ) : (
            <GeneratePlaceholder
              label="生成摘要"
              generating={generating}
              onGenerate={() => handleGenerate("summary")}
            />
          )
        )}

        {activeTab === "quiz" && (
          materials.quiz ? (
            <QuizView content={materials.quiz} />
          ) : (
            <GeneratePlaceholder
              label="生成测验"
              generating={generating}
              onGenerate={() => handleGenerate("quiz")}
            />
          )
        )}

        {activeTab === "flashcard" && (
          materials.flashcard ? (
            <FlashcardView content={materials.flashcard} />
          ) : (
            <GeneratePlaceholder
              label="生成记忆卡"
              generating={generating}
              onGenerate={() => handleGenerate("flashcard")}
            />
          )
        )}

        {activeTab === "audio" && (
          audioUrl ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="w-full max-w-md space-y-4">
                <p className="text-sm text-[var(--text-secondary)] text-center">播客音频</p>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            </div>
          ) : (
            <GeneratePlaceholder
              label="生成播客音频"
              generating={generating}
              onGenerate={() => handleGenerate("audio")}
              note="生成音频可能需要几分钟"
            />
          )
        )}

        {activeTab === "qa" && (
          <QAView
            excerptId={excerpt.id}
            initialMessages={materials.qa ?? []}
          />
        )}
      </div>

      {/* Bottom bar */}
      <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center gap-4">
        <span className="text-sm text-[var(--text-secondary)]">
          已完成 {progressCount}/5 个工具
        </span>
        <div className="flex-1" />
        <button
          onClick={handleFinish}
          disabled={archiving}
          className="px-4 py-2 text-sm bg-green-600/20 border border-green-500/30 text-green-300 rounded hover:bg-green-600/30 transition-colors disabled:opacity-50"
        >
          {archiving ? "归档中..." : "已掌握 → 确认归档"}
        </button>
      </div>
    </div>
  );
}

function GeneratePlaceholder({
  label,
  generating,
  onGenerate,
  note,
}: {
  label: string;
  generating: boolean;
  onGenerate: () => void;
  note?: string;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">尚未生成</p>
        {note && <p className="text-xs text-[var(--text-secondary)] opacity-60">{note}</p>}
        <button
          onClick={onGenerate}
          disabled={generating}
          className="px-5 py-2.5 text-sm bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] rounded hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-50"
        >
          {generating ? "生成中..." : label}
        </button>
      </div>
    </div>
  );
}
