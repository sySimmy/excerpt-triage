"use client";

import { useState } from "react";

interface Question {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

interface QuizViewProps {
  content: {
    questions: Question[];
  };
}

export default function QuizView({ content }: QuizViewProps) {
  const questions = content.questions;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        暂无题目
      </div>
    );
  }

  function handleRetry() {
    setCurrentIdx(0);
    setSelected(null);
    setCorrectCount(0);
    setFinished(false);
  }

  if (finished) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl font-bold text-[var(--text)]">
            {correctCount}/{questions.length}
          </div>
          <div className="text-lg text-[var(--text-secondary)]">
            正确率 {pct}%
          </div>
          <button
            onClick={handleRetry}
            className="mt-4 px-5 py-2.5 text-sm bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
          >
            重新练习
          </button>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  const revealed = selected !== null;

  function handleSelect(idx: number) {
    if (revealed) return;
    setSelected(idx);
    if (idx === q.answer) {
      setCorrectCount((prev) => prev + 1);
    }
  }

  function handleNext() {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setSelected(null);
    } else {
      setFinished(true);
    }
  }

  return (
    <div className="h-full flex flex-col px-5 py-4 overflow-y-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-4 text-xs text-[var(--text-secondary)]">
        <span>
          第 {currentIdx + 1} / {questions.length} 题
        </span>
        <span className="text-green-400">{correctCount} 正确</span>
      </div>

      {/* Question */}
      <div className="text-base font-medium text-[var(--text)] mb-4 leading-relaxed">
        {q.question}
      </div>

      {/* Options */}
      <div className="space-y-2.5 flex-1">
        {q.options.map((opt, i) => {
          let cls =
            "w-full text-left px-4 py-3 rounded border text-sm transition-colors ";
          if (!revealed) {
            cls +=
              "border-[var(--border)] bg-[var(--bg-tertiary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 text-[var(--text)]";
          } else if (i === q.answer) {
            cls += "border-green-500/50 bg-green-500/10 text-green-300";
          } else if (i === selected) {
            cls += "border-red-500/50 bg-red-500/10 text-red-300";
          } else {
            cls +=
              "border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] opacity-60";
          }

          return (
            <button key={i} className={cls} onClick={() => handleSelect(i)}>
              <span className="mr-2 font-medium text-[var(--text-secondary)]">
                {String.fromCharCode(65 + i)}.
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {revealed && (
        <div className="mt-4 p-3 rounded bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] leading-relaxed">
          {q.explanation}
        </div>
      )}

      {/* Next button */}
      {revealed && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleNext}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
          >
            {currentIdx < questions.length - 1 ? "下一题 →" : "查看结果"}
          </button>
        </div>
      )}
    </div>
  );
}
