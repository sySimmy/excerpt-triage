"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import useSWR from "swr";
import ExcerptList from "@/components/ExcerptList";
import ReadingPanel from "@/components/ReadingPanel";
import FilterBar from "@/components/FilterBar";
import ViewTabs, { type ViewKey } from "@/components/ViewTabs";
import ArchiveFilterBar from "@/components/ArchiveFilterBar";
import ArchiveGroupList from "@/components/ArchiveGroupList";
import StatsView from "@/components/StatsView";
import TagFeedbackView from "@/components/TagFeedbackView";
import { buildTagFilterOptions, isStaleInboxResponse, shouldSkipInboxLoad } from "@/lib/inbox-filters";
import { ALL_TAGS } from "@/lib/tag-vocab";

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
  deep_read: number;
}

interface TagStat {
  tag: string;
  count: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface TranslationState {
  status: "translating" | "done" | "error";
  text?: string;
}

const VALID_VIEWS: ViewKey[] = ["inbox", "deep-read", "archive", "stats", "tag-feedback"];

export default function Home() {
  const [activeView, setActiveViewRaw] = useState<ViewKey>("inbox");

  // Restore last active tab from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem("activeView");
    if (saved && VALID_VIEWS.includes(saved as ViewKey)) {
      setActiveViewRaw(saved as ViewKey);
    }
  }, []);

  function setActiveView(view: ViewKey) {
    setActiveViewRaw(view);
    localStorage.setItem("activeView", view);
  }

  // === Translation state (shared across excerpts) ===
  const [translations, setTranslations] = useState<Map<number, TranslationState>>(new Map());

  function startTranslation(id: number, content: string) {
    setTranslations((prev) => {
      const next = new Map(prev);
      next.set(id, { status: "translating" });
      return next;
    });

    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("translate failed");
        return res.json();
      })
      .then((data) => {
        setTranslations((prev) => {
          const next = new Map(prev);
          next.set(id, { status: "done", text: data.translation });
          return next;
        });
        // Save translation to file (fire-and-forget)
        fetch(`/api/excerpts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translation: data.translation }),
        });
      })
      .catch(() => {
        setTranslations((prev) => {
          const next = new Map(prev);
          next.set(id, { status: "error" });
          return next;
        });
      });
  }

  // === Inbox state ===
  const [filters, setFilters] = useState({ status: "", source_type: "", search: "", tag: "", captured_within: "", sort: "recent", _randomSeed: 0 });
  const [items, setItems] = useState<ExcerptItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const offsetRef = useRef(0);
  const inboxRequestIdRef = useRef(0);
  const inboxLoadingRef = useRef(false);

  // === Archive state ===
  const [archiveItems, setArchiveItems] = useState<ExcerptItem[]>([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveTagStats, setArchiveTagStats] = useState<TagStat[]>([]);
  const [archiveSelectedTags, setArchiveSelectedTags] = useState<string[]>([]);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveSelectedId, setArchiveSelectedId] = useState<number | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // === Deep read state ===
  const [deepReadItems, setDeepReadItems] = useState<ExcerptItem[]>([]);
  const [deepReadTotal, setDeepReadTotal] = useState(0);
  const [deepReadSelectedId, setDeepReadSelectedId] = useState<number | null>(null);
  const [deepReadLoading, setDeepReadLoading] = useState(false);

  // Tag suggestions from vocabulary
  const { data: tagData } = useSWR<{ tag: string; count: number }[]>("/api/tags", fetcher);
  const tagFilterOptions = buildTagFilterOptions(ALL_TAGS, tagData ?? []);
  const tagSuggestions = tagFilterOptions.map((option) => option.value);

  // Initial sync
  useEffect(() => {
    fetch("/api/sync", { method: "POST" })
      .then(() => setInitialized(true))
      .catch(() => setInitialized(true));
  }, []);

  // === Inbox: Load excerpts ===
  const loadExcerpts = useCallback(
    async (reset = false) => {
      if (shouldSkipInboxLoad({ loading: inboxLoadingRef.current, reset })) return;

      const requestId = ++inboxRequestIdRef.current;
      inboxLoadingRef.current = true;
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
        if (isStaleInboxResponse({ requestId, latestRequestId: inboxRequestIdRef.current })) return;

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
        if (!isStaleInboxResponse({ requestId, latestRequestId: inboxRequestIdRef.current })) {
          inboxLoadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [filters]
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

  // === Deep read: Load data ===
  const loadDeepRead = useCallback(async () => {
    setDeepReadLoading(true);
    try {
      const data = await fetcher("/api/deep-read/excerpts?limit=200");
      setDeepReadItems(data.items);
      setDeepReadTotal(data.total);
    } finally {
      setDeepReadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized || activeView !== "deep-read") return;
    loadDeepRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, initialized]);

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

  // After deep-read, remove from inbox list
  function handleDeepRead() {
    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setStats((prev) => {
      if (!prev) return prev;
      return { ...prev, deep_read: prev.deep_read + 1 };
    });
  }

  // Deep read tab: navigate to next
  function handleDeepReadNext() {
    if (!deepReadSelectedId || deepReadItems.length === 0) return;
    const idx = deepReadItems.findIndex((i) => i.id === deepReadSelectedId);
    if (idx < deepReadItems.length - 1) {
      setDeepReadSelectedId(deepReadItems[idx + 1].id);
    }
  }

  // Deep read tab: after archive
  function handleDeepReadArchived() {
    setDeepReadItems((prev) => prev.filter((i) => i.id !== deepReadSelectedId));
    setDeepReadTotal((prev) => prev - 1);
    setStats((prev) => {
      if (!prev) return prev;
      return { ...prev, archived: prev.archived + 1, deep_read: Math.max(0, prev.deep_read - 1) };
    });
  }

  // Deep read tab: after delete
  function handleDeepReadDeleted() {
    setDeepReadItems((prev) => prev.filter((i) => i.id !== deepReadSelectedId));
    setDeepReadTotal((prev) => prev - 1);
    setStats((prev) => {
      if (!prev) return prev;
      return { ...prev, total: prev.total - 1, deep_read: Math.max(0, prev.deep_read - 1) };
    });
  }

  // Keyboard: arrow up/down (works in all list views)
  useEffect(() => {
    const currentItems = activeView === "inbox" ? items : activeView === "deep-read" ? deepReadItems : archiveItems;
    const currentSelectedId = activeView === "inbox" ? selectedId : activeView === "deep-read" ? deepReadSelectedId : archiveSelectedId;
    const setCurrentSelectedId = activeView === "inbox" ? setSelectedId : activeView === "deep-read" ? setDeepReadSelectedId : setArchiveSelectedId;

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
  }, [items, selectedId, deepReadItems, deepReadSelectedId, archiveItems, archiveSelectedId, activeView]);

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
      <ViewTabs activeView={activeView} onChange={setActiveView} deepReadCount={stats?.deep_read} />

      {activeView === "inbox" ? (
        <>
          <FilterBar filters={filters} onChange={setFilters} stats={stats} tagOptions={tagFilterOptions} />
          <div className="flex-1 flex overflow-hidden">
            <div className="w-80 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg)]">
              <ExcerptList
                items={items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onLoadMore={() => loadExcerpts(false)}
                hasMore={hasMore}
                loading={loading}
                translations={translations}
              />
            </div>
            <div className="flex-1 bg-[var(--bg)]">
              <ReadingPanel
                excerptId={selectedId}
                tagSuggestions={tagSuggestions}
                onArchived={handleArchived}
                onDeleted={handleDeleted}
                onNext={handleNext}
                onDeepRead={handleDeepRead}
                translationState={selectedId ? translations.get(selectedId) : undefined}
                onTranslate={startTranslation}
              />
            </div>
          </div>
        </>
      ) : activeView === "deep-read" ? (
        <>
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            <span className="text-sm text-[var(--text-secondary)]">
              {deepReadTotal} 篇待精读
            </span>
          </div>
          <div className="flex-1 flex overflow-hidden">
            <div className="w-80 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg)]">
              {deepReadLoading ? (
                <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-sm">
                  加载中...
                </div>
              ) : (
                <ExcerptList
                  items={deepReadItems}
                  selectedId={deepReadSelectedId}
                  onSelect={setDeepReadSelectedId}
                  onLoadMore={() => {}}
                  hasMore={false}
                  loading={false}
                  translations={translations}
                />
              )}
            </div>
            <div className="flex-1 bg-[var(--bg)]">
              <ReadingPanel
                excerptId={deepReadSelectedId}
                tagSuggestions={tagSuggestions}
                deepReadMode
                onArchived={handleDeepReadArchived}
                onDeleted={handleDeepReadDeleted}
                onNext={handleDeepReadNext}
                translationState={deepReadSelectedId ? translations.get(deepReadSelectedId) : undefined}
                onTranslate={startTranslation}
              />
            </div>
          </div>
        </>
      ) : activeView === "archive" ? (
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
                translationState={archiveSelectedId ? translations.get(archiveSelectedId) : undefined}
                onTranslate={startTranslation}
                onUnarchived={() => {
                  setArchiveSelectedId(null);
                  loadArchive();
                }}
              />
            </div>
          </div>
        </>
      ) : activeView === "stats" ? (
        <div className="flex-1 overflow-hidden">
          <StatsView />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <TagFeedbackView />
        </div>
      )}
    </div>
  );
}
