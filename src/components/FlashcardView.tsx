"use client";

import { useState } from "react";

interface Card {
  front: string;
  back: string;
}

interface FlashcardViewProps {
  content: {
    cards: Card[];
  };
}

export default function FlashcardView({ content }: FlashcardViewProps) {
  const cards = content.cards;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        暂无卡片
      </div>
    );
  }

  const card = cards[currentIdx];

  function goNext() {
    if (currentIdx < cards.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setFlipped(false);
    }
  }

  function goPrev() {
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1);
      setFlipped(false);
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-4 gap-6">
      {/* Counter */}
      <div className="text-xs text-[var(--text-secondary)]">
        {currentIdx + 1} / {cards.length}
      </div>

      {/* Card */}
      <button
        onClick={() => setFlipped((prev) => !prev)}
        className="w-full max-w-lg min-h-48 flex items-center justify-center p-6 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/50 transition-colors cursor-pointer text-center"
      >
        <div>
          {!flipped ? (
            <div className="text-base font-medium text-[var(--text)] leading-relaxed">
              {card.front}
            </div>
          ) : (
            <div className="text-base text-[var(--text-secondary)] leading-relaxed">
              {card.back}
            </div>
          )}
          <div className="mt-3 text-xs text-[var(--text-secondary)] opacity-50">
            {flipped ? "背面 · 点击翻回" : "正面 · 点击翻转"}
          </div>
        </div>
      </button>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={goPrev}
          disabled={currentIdx === 0}
          className="px-4 py-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ←
        </button>
        <button
          onClick={() => setFlipped((prev) => !prev)}
          className="px-4 py-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border)] transition-colors"
        >
          翻转
        </button>
        <button
          onClick={goNext}
          disabled={currentIdx === cards.length - 1}
          className="px-4 py-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}
