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

  return (
    <div className="h-full flex flex-col">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && !thinking && !pendingQuestion && (
          <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-sm">
            对这篇文章提问吧
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.timestamp} data-state={i === selectedIndex ? "selected" : undefined} className="space-y-2">
            {/* Question — right aligned */}
            <div className="flex justify-end">
              <div className="max-w-xs lg:max-w-md px-3 py-2 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-sm text-[var(--text)] text-right">
                {msg.question}
              </div>
            </div>
            {/* Answer — left aligned */}
            <div className="flex justify-start">
              <div className="max-w-xs lg:max-w-md px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] leading-relaxed">
                {msg.answer}
              </div>
            </div>
          </div>
        ))}

        {pendingQuestion && (
          <div data-state={selectedIndex === messages.length ? "pending" : undefined} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-xs lg:max-w-md px-3 py-2 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-sm text-[var(--text)] text-right">
                {pendingQuestion}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] italic">
                思考中...
              </div>
            </div>
          </div>
        )}

        {thinking && !pendingQuestion && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] italic">
              思考中...
            </div>
          </div>
        )}
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
