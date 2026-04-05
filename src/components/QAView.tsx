"use client";

import { useState, useEffect } from "react";

interface QAMessage {
  question: string;
  answer: string;
  timestamp: string;
}

interface QAViewProps {
  excerptId: number;
  initialMessages?: QAMessage[];
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function QAView({ excerptId, initialMessages = [] }: QAViewProps) {
  const [messages, setMessages] = useState<QAMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(
    initialMessages.length > 0 ? initialMessages.length - 1 : -1,
  );
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setSelectedIndex(initialMessages.length > 0 ? initialMessages.length - 1 : -1);
    setPendingQuestion(null);
    setThinking(false);
  }, [initialMessages]);

  async function handleSend() {
    const question = input.trim();
    if (!question || thinking) return;
    setInput("");
    setThinking(true);
    setPendingQuestion(question);
    setSelectedIndex(messages.length);
    try {
      const res = await fetch("/api/learning/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excerpt_id: excerptId, question }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { question, answer: data.answer as string, timestamp: new Date().toISOString() },
        ]);
        setSelectedIndex(messages.length);
      } else {
        setMessages((prev) => [
          ...prev,
          { question, answer: "出错了，请重试", timestamp: new Date().toISOString() },
        ]);
        setSelectedIndex(messages.length);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { question, answer: "网络错误，请重试", timestamp: new Date().toISOString() },
      ]);
      setSelectedIndex(messages.length);
    } finally {
      setPendingQuestion(null);
      setThinking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const pendingSelected = pendingQuestion !== null && selectedIndex === messages.length;
  const selectedMessage = selectedIndex >= 0 && selectedIndex < messages.length ? messages[selectedIndex] : null;
  const focusedQuestion = pendingSelected ? pendingQuestion : selectedMessage?.question ?? null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex flex-col md:grid md:grid-cols-[240px_minmax(0,1fr)]">
          <aside
            aria-label="问答历史"
            className="border-b border-[var(--border)] bg-[var(--bg-secondary)] md:border-b-0 md:border-r"
          >
            <div className="flex gap-2 overflow-x-auto px-3 py-3 md:flex-col md:overflow-y-auto md:px-3 md:py-4">
              {messages.map((msg, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <button
                    key={msg.timestamp}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    data-state={isSelected ? "selected" : undefined}
                    aria-pressed={isSelected}
                    className={`min-w-[180px] rounded-lg border px-3 py-2 text-left transition-colors md:min-w-0 ${
                      isSelected
                        ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--bg-tertiary)]/60 text-[var(--text-secondary)] hover:text-[var(--text)]"
                    }`}
                  >
                    <div className="truncate text-sm font-medium">{msg.question}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{formatTimestamp(msg.timestamp)}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-h-0 flex flex-1 flex-col overflow-hidden">
            <div
              data-state={pendingSelected ? "pending" : focusedQuestion ? "selected" : undefined}
              className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3"
            >
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-secondary)]">当前问题</div>
              <div className="mt-2 text-sm font-medium text-[var(--text)]">
                {focusedQuestion ?? "从历史列表中选择一个问题，或直接开始新的追问"}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {selectedMessage && !pendingSelected && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-5 text-sm leading-relaxed text-[var(--text)]">
                  {selectedMessage.answer}
                </div>
              )}

              {pendingSelected && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-5">
                  <div className="space-y-3" aria-label="回答生成中">
                    <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                    <div className="h-3 w-full animate-pulse rounded bg-[var(--bg-tertiary)]" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                  </div>
                </div>
              )}

              {!selectedMessage && !pendingSelected && (
                <div className="flex h-full items-center justify-center text-center text-sm text-[var(--text-secondary)]">
                  对这篇文章提问吧
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题... (Enter 发送, Shift+Enter 换行)"
          rows={2}
          className="flex-1 resize-none bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={thinking || !input.trim()}
          className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          发送
        </button>
      </div>
    </div>
  );
}
