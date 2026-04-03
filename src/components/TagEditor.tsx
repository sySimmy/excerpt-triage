"use client";

import { useState, useRef, useEffect } from "react";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}

export default function TagEditor({ tags: rawTags, onChange, suggestions }: TagEditorProps) {
  const tags = [...new Set(rawTags)];
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions
    .filter((s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s))
    .slice(0, 8);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIdx(-1);
  }, [input]);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
    setShowSuggestions(false);
    setSelectedIdx(-1);
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

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (showSuggestions && filtered.length > 0) {
        setSelectedIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
      }
      return;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (showSuggestions && filtered.length > 0) {
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (selectedIdx >= 0 && selectedIdx < filtered.length) {
        addTag(filtered[selectedIdx]);
      } else if (input.trim()) {
        const value = input;
        setInput("");
        addTag(value);
      }
      return;
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedIdx(-1);
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("button");
      items[selectedIdx]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
        setShowSuggestions(false);
        setSelectedIdx(-1);
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
          className="tag-editor-input flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--text)]"
        />
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s}
              onClick={() => addTag(s)}
              className={`block w-full text-left px-3 py-1.5 text-sm transition-colors ${
                i === selectedIdx
                  ? "bg-[var(--accent)]/20 text-[var(--text)]"
                  : "hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
