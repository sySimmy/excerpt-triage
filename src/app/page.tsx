"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import useSWR from "swr";
import ExcerptList from "@/components/ExcerptList";
import ReadingPanel from "@/components/ReadingPanel";
import FilterBar from "@/components/FilterBar";
import ViewTabs from "@/components/ViewTabs";
import ArchiveFilterBar from "@/components/ArchiveFilterBar";
import ArchiveGroupList from "@/components/ArchiveGroupList";

interface ExcerptItem {
  id: number;
  title: string | null;
  source_type: string | null;
  source_name: string | null;
  signal: number;
  status: string;
  published_at: string | null;
  tags: string;
}

interface Stats {
  total: number;
  to_process: number;
  reading: number;
  read: number;
  archived: number;
}

interface TagStat {
  tag: string;
  count: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [activeView, setActiveView] = useState<"inbox" | "archive">("inbox");

  // === Inbox state ===
  const [filters, setFilters] = useState({ status: "", source_type: "", search: "", tag: "", captured_within: "", sort: "recent", _randomSeed: 0 });
  const [items, setItems] = useState<ExcerptItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const offsetRef = useRef(0);

  // === Archive state ===
  const [archiveItems, setArchiveItems] = useState<ExcerptItem[]>([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveTagStats, setArchiveTagStats] = useState<TagStat[]>([]);
  const [archiveSelectedTags, setArchiveSelectedTags] = useState<string[]>([]);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveSelectedId, setArchiveSelectedId] = useState<number | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Tag suggestions from vocabulary
  const { data: tagData } = useSWR("/api/tags", fetcher);
  const dbTags = (tagData ?? []).map((t: { tag: string }) => t.tag);
  const vocabTags = ["ai-coding", "agents", "pkm", "design", "business", "investing", "life", "claude-code", "openclaw", "obsidian", "cursor", "mcp", "workflow", "deployment", "automation", "content-creation", "go-global", "growth", "quant", "ip", "tutorial", "opinion", "tool", "research", "translation"];
  const tagSuggestions = [...vocabTags, ...dbTags.filter((t: string) => !vocabTags.includes(t))];

  // Initial sync
  useEffect(() => {
    fetch("/api/sync", { method: "POST" })
      .then(() => setInitialized(true))
      .catch(() => setInitialized(true));
  }, []);

  // === Inbox: Load excerpts ===
  const loadExcerpts = useCallback(
    async (reset = false) => {
      if (loading) return;
      setLoading(true);

      const offset = reset ? 0 : offsetRef.current;
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.source_type) params.set("source_type", filters.source_type);
      if (filters.search) params.set("search", filters.search);
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.captured_within) params.set("captured_within", filters.captured_within);
      if (filters.sort && filters.sort !== "recent") params.set("sort", filters.sort);
      params.set("limit", "50");
      params.set("offset", String(offset));

      try {
        const data = await fetcher(`/api/excerpts?${params}`);
        if (reset) {
          setItems(data.items);
        } else {
          setItems((prev) => {
            const existing = new Set(prev.map((i) => i.id));
            return [...prev, ...data.items.filter((i: ExcerptItem) => !existing.has(i.id))];
          });
        }
        setTotal(data.total);
        setStats(data.stats);
        offsetRef.current = offset + data.items.length;
      } finally {
        setLoading(false);
      }
    },
    [filters, loading]
  );

  // Reload inbox on filter change or init
  useEffect(() => {
    if (!initialized) return;
    offsetRef.current = 0;
    loadExcerpts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, initialized]);

  // === Archive: Load data ===
  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const params = new URLSearchParams();
      if (archiveSelectedTags.length > 0) params.set("tags", archiveSelectedTags.join(","));
      if (archiveSearch) params.set("search", archiveSearch);
      params.set("limit", "200");

      const [excerptData, tagData] = await Promise.all([
        fetcher(`/api/archive/excerpts?${params}`),
        fetcher("/api/archive/tags"),
      ]);
      setArchiveItems(excerptData.items);
      setArchiveTotal(excerptData.total);
      setArchiveTagStats(tagData.tags);
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveSelectedTags, archiveSearch]);

  // Reload archive on filter change or tab switch
  useEffect(() => {
    if (!initialized || activeView !== "archive") return;
    loadArchive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveSelectedTags, archiveSearch, activeView, initialized]);

  // Navigate to next item (inbox)
  function handleNext() {
    if (!selectedId || items.length === 0) return;
    const idx = items.findIndex((i) => i.id === selectedId);
    if (idx < items.length - 1) {
      setSelectedId(items[idx + 1].id);
    }
  }

  // After archive, remove from list and go next
  function handleArchived() {
    const item = items.find((i) => i.id === selectedId);
    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setStats((prev) => {
      if (!prev || !item) return prev;
      const key = item.status as keyof Stats;
      return {
        ...prev,
        archived: prev.archived + 1,
        ...(key !== "archived" && key in prev ? { [key]: Math.max(0, prev[key] - 1) } : {}),
      };
    });
  }

  // After delete, remove from list
  function handleDeleted() {
    const item = items.find((i) => i.id === selectedId);
    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setStats((prev) => {
      if (!prev || !item) return prev;
      const key = item.status as keyof Stats;
      return {
        ...prev,
        total: prev.total - 1,
        ...(key in prev ? { [key]: Math.max(0, prev[key] - 1) } : {}),
      };
    });
  }

  // Keyboard: arrow up/down (works in both views)
  useEffect(() => {
    const currentItems = activeView === "inbox" ? items : archiveItems;
    const currentSelectedId = activeView === "inbox" ? selectedId : archiveSelectedId;
    const setCurrentSelectedId = activeView === "inbox" ? setSelectedId : setArchiveSelectedId;

    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!currentSelectedId && currentItems.length > 0) {
          setCurrentSelectedId(currentItems[0].id);
        } else {
          const idx = currentItems.findIndex((i) => i.id === currentSelectedId);
          if (idx < currentItems.length - 1) setCurrentSelectedId(currentItems[idx + 1].id);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = currentItems.findIndex((i) => i.id === currentSelectedId);
        if (idx > 0) setCurrentSelectedId(currentItems[idx - 1].id);
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        const tagInput = document.querySelector<HTMLInputElement>(".tag-editor-input");
        tagInput?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items, selectedId, archiveItems, archiveSelectedId, activeView]);

  const hasMore = filters.sort !== "random" && items.length < total;

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg mb-2">正在扫描文件...</div>
          <div className="text-sm text-[var(--text-secondary)]">首次启动需要索引所有 Markdown 文件</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <ViewTabs activeView={activeView} onChange={setActiveView} />

      {activeView === "inbox" ? (
        <>
          <FilterBar filters={filters} onChange={setFilters} stats={stats} />
          <div className="flex-1 flex overflow-hidden">
            <div className="w-80 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg)]">
              <ExcerptList
                items={items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onLoadMore={() => loadExcerpts(false)}
                hasMore={hasMore}
                loading={loading}
              />
            </div>
            <div className="flex-1 bg-[var(--bg)]">
              <ReadingPanel
                excerptId={selectedId}
                tagSuggestions={tagSuggestions}
                onArchived={handleArchived}
                onDeleted={handleDeleted}
                onNext={handleNext}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <ArchiveFilterBar
            tagStats={archiveTagStats}
            selectedTags={archiveSelectedTags}
            onSelectedTagsChange={setArchiveSelectedTags}
            search={archiveSearch}
            onSearchChange={setArchiveSearch}
            totalItems={archiveTotal}
          />
          <div className="flex-1 flex overflow-hidden">
            <div className="w-80 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg)]">
              {archiveLoading ? (
                <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-sm">
                  加载中...
                </div>
              ) : (
                <ArchiveGroupList
                  items={archiveItems}
                  selectedId={archiveSelectedId}
                  onSelect={setArchiveSelectedId}
                  onClearFilters={() => {
                    setArchiveSelectedTags([]);
                    setArchiveSearch("");
                  }}
                  hasFilters={archiveSelectedTags.length > 0 || archiveSearch !== ""}
                />
              )}
            </div>
            <div className="flex-1 bg-[var(--bg)]">
              <ReadingPanel
                excerptId={archiveSelectedId}
                tagSuggestions={tagSuggestions}
                archiveMode
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
