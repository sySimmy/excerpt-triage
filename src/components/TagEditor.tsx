"use client";

import { useState, useRef, useEffect } from "react";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}

export default function TagEditor({ tags, onChange, suggestions }: TagEditorProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions
    .filter((s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s))
    .slice(0, 8);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
    setShowSuggestions(false);
    // Force clear the input element value in case React state doesn't sync
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ignore IME composition events
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      e.stopPropagation();
      const value = input;
      setInput("");
      addTag(value);
      return;
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center p-2 bg-[var(--bg-tertiary)] rounded-md border border-[var(--border)] min-h-[38px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded text-sm"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-white text-xs">
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "添加标签..." : ""}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--text)]"
        />
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              onClick={() => addTag(s)}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
