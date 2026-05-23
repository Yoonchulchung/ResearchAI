"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getJobPosting,
  listJobPostings,
  fetchJobPostingDetail,
  setJobPostingFavorite,
  getPopularJobPostings,
  type JobPosting,
  type JobPostingFilterOptions,
  type JobPostingListParams,
} from "@/lib/api/recruit/job-posting";
import { isNearScrollBottom } from "@/lib/scroll-guards";
import {
  PAGE_SIZE,
  DEFAULT_FILTER_OPTIONS,
  readPersistedFilters,
  persistFilters,
} from "../_constants";
import {
  getDeadlineDate,
  getStartDate,
  toDateKey,
  getCalendarDays,
  matchesPopularCategory,
  isTypingTarget,
} from "../_utils";
import type { CalendarEvent, CalendarEventKind } from "../_types";

export function useJobPostings(jobId: string | null) {
  const router = useRouter();

  const [items, setItems] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filterOptions, setFilterOptions] = useState<JobPostingFilterOptions>(DEFAULT_FILTER_OPTIONS);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [companyTypeFilter, setCompanyTypeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"latest" | "deadline">("latest");
  const [isReady, setIsReady] = useState(false);

  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isFiltersHidden, setIsFiltersHidden] = useState(false);

  const [popularPostings, setPopularPostings] = useState<JobPosting[]>([]);
  const [favoritePostings, setFavoritePostings] = useState<JobPosting[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularCategoryFilter, setPopularCategoryFilter] = useState<"" | "IT" | "전자">("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const listScrollTopRef = useRef(0);
  const detailScrollTopRef = useRef(0);
  const listItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const detailCacheRef = useRef<Map<string, Partial<JobPosting>>>(new Map());
  const itemsRef = useRef<JobPosting[]>([]);
  const selectedRef = useRef<JobPosting | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestSeqRef = useRef(0);
  const currentFiltersRef = useRef<JobPostingListParams>({});
  const currentPageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const selectFirstNewItemAfterLoadRef = useRef(false);

  itemsRef.current = items;
  selectedRef.current = selected;

  const selectPosting = useCallback(
    (posting: JobPosting) => {
      setSelected(posting);
      router.push(`/recruit/job-posting?job=${encodeURIComponent(posting.id)}`);
    },
    [router],
  );

  const clearSelected = useCallback(() => {
    setSelected(null);
    router.push("/recruit/job-posting");
  }, [router]);

  const applyFavoriteState = useCallback((id: string, favorite: boolean) => {
    setItems((prev) =>
      currentFiltersRef.current.favorite && !favorite
        ? prev.filter((item) => item.id !== id)
        : prev.map((item) => (item.id === id ? { ...item, favorite } : item)),
    );
    setPopularPostings((prev) => prev.map((item) => (item.id === id ? { ...item, favorite } : item)));
    setFavoritePostings((prev) =>
      favorite ? prev.map((item) => (item.id === id ? { ...item, favorite } : item)) : prev.filter((item) => item.id !== id),
    );
    setSelected((prev) => (prev?.id === id ? { ...prev, favorite } : prev));
    const cached = detailCacheRef.current.get(id);
    if (cached) detailCacheRef.current.set(id, { ...cached, favorite });
  }, []);

  const toggleFavorite = useCallback(
    async (posting: JobPosting, event?: MouseEvent<HTMLElement>) => {
      event?.preventDefault();
      event?.stopPropagation();
      const next = !posting.favorite;
      applyFavoriteState(posting.id, next);
      if (next) {
        setFavoritePostings((prev) =>
          prev.some((item) => item.id === posting.id)
            ? prev.map((item) => (item.id === posting.id ? { ...item, favorite: true } : item))
            : [{ ...posting, favorite: true }, ...prev],
        );
      }
      try {
        const result = await setJobPostingFavorite(posting.id, next);
        applyFavoriteState(posting.id, result.favorite);
        if (result.favorite) {
          setFavoritePostings((prev) =>
            prev.some((item) => item.id === posting.id)
              ? prev.map((item) => (item.id === posting.id ? { ...item, favorite: true } : item))
              : [{ ...posting, favorite: true }, ...prev],
          );
        }
      } catch {
        applyFavoriteState(posting.id, !!posting.favorite);
        if (posting.favorite) {
          setFavoritePostings((prev) =>
            prev.some((item) => item.id === posting.id) ? prev : [{ ...posting, favorite: true }, ...prev],
          );
        }
      }
    },
    [applyFavoriteState],
  );

  const loadItems = async (p: number, reset: boolean, filters: JobPostingListParams) => {
    if (!reset && loadingRef.current) return;
    const requestSeq = ++requestSeqRef.current;
    const requestKey = JSON.stringify(filters);
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await listJobPostings({ ...filters, page: p, limit: PAGE_SIZE });
      if (requestSeq !== requestSeqRef.current || requestKey !== JSON.stringify(currentFiltersRef.current)) return;
      setTotal(res.total);
      setFilterOptions({
        ...DEFAULT_FILTER_OPTIONS,
        ...res.filterOptions,
        types: res.filterOptions.types.length > 0 ? res.filterOptions.types : DEFAULT_FILTER_OPTIONS.types,
      });
      const firstNewItem = !reset && selectFirstNewItemAfterLoadRef.current ? res.items[0] : undefined;
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      if (firstNewItem) {
        selectFirstNewItemAfterLoadRef.current = false;
        selectPosting(firstNewItem);
      }
      const more = res.items.length === PAGE_SIZE;
      setHasMore(more);
      hasMoreRef.current = more;
      currentPageRef.current = p;
    } finally {
      if (requestSeq === requestSeqRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  const loadRef = useRef(loadItems);
  loadRef.current = loadItems;

  const reload = useCallback(() => {
    loadRef.current(1, true, currentFiltersRef.current);
  }, []);

  const buildFilters = useCallback(
    (): JobPostingListParams => ({
      source: sourceFilter && sourceFilter !== "favorite" ? sourceFilter : undefined,
      search: search.trim() || undefined,
      companyType: companyTypeFilter || undefined,
      type: typeFilter === "신입/인턴" ? "신입,인턴" : typeFilter || undefined,
      category: categoryFilter || undefined,
      sort: sortOrder,
      favorite: sourceFilter === "favorite" || undefined,
    }),
    [categoryFilter, companyTypeFilter, search, sourceFilter, sortOrder, typeFilter],
  );

  const handleSourceChange = (src: string) => setSourceFilter(src);

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (isNearScrollBottom(el)) {
      listScrollTopRef.current = scrollTop;
      return;
    }
    const delta = scrollTop - listScrollTopRef.current;
    listScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta < 0) {
      setIsHeaderHidden(false);
      setIsFiltersHidden(false);
    } else if (delta > 0 && scrollTop > 10) {
      setIsHeaderHidden(true);
      setIsFiltersHidden(true);
    }
  }, []);

  const handleDetailScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    if (isNearScrollBottom(el)) {
      detailScrollTopRef.current = scrollTop;
      return;
    }
    const delta = scrollTop - detailScrollTopRef.current;
    detailScrollTopRef.current = scrollTop;
    if (Math.abs(delta) < 4) return;
    if (delta > 0 && scrollTop > 10) setIsHeaderHidden(true);
    else if (delta < 0) setIsHeaderHidden(false);
  }, []);

  const moveCalendarMonth = (delta: number) =>
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  // Init filters from localStorage
  useEffect(() => {
    const persisted = readPersistedFilters();
    setSearch(persisted.search);
    setSourceFilter(persisted.sourceFilter);
    setCompanyTypeFilter(persisted.companyTypeFilter);
    setTypeFilter(persisted.typeFilter);
    setCategoryFilter(persisted.categoryFilter);
    setSortOrder(persisted.sortOrder);
    setIsReady(true);
  }, []);

  // Load popular + favorites
  useEffect(() => {
    setPopularLoading(true);
    Promise.all([
      getPopularJobPostings().catch(() => []),
      listJobPostings({ favorite: true, page: 1, limit: 500, sort: "deadline" })
        .then((res) => res.items)
        .catch(() => []),
    ])
      .then(([popular, favorites]) => {
        setPopularPostings(popular);
        setFavoritePostings(favorites);
      })
      .catch(() => {})
      .finally(() => setPopularLoading(false));
  }, []);

  // Reload on filter change
  useEffect(() => {
    if (!isReady) return;
    const filters = buildFilters();
    persistFilters({ search, sourceFilter, companyTypeFilter, typeFilter, categoryFilter, sortOrder });
    currentFiltersRef.current = filters;
    setSelected(null);
    setHasMore(true);
    hasMoreRef.current = true;
    loadRef.current(1, true, filters);
  }, [isReady, buildFilters, sourceFilter, search, companyTypeFilter, typeFilter, categoryFilter, sortOrder]);

  // Sync URL job param
  useEffect(() => {
    if (!jobId) {
      setSelected(null);
      return;
    }
    const existing = items.find((item) => item.id === jobId);
    if (existing) {
      setSelected(existing);
      return;
    }
    let cancelled = false;
    getJobPosting(jobId)
      .then((posting) => {
        if (cancelled) return;
        setSelected(posting);
        setItems((prev) => (prev.some((item) => item.id === posting.id) ? prev : [posting, ...prev]));
      })
      .catch(() => {
        if (!cancelled) setSelected(null);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, items]);

  // Fetch detail on selection
  useEffect(() => {
    if (!selected) return;
    const cached = detailCacheRef.current.get(selected.id);
    if (cached) {
      setSelected((prev) => (prev ? { ...prev, ...cached } : prev));
      return;
    }
    setDetailLoading(true);
    fetchJobPostingDetail(selected.id, selected.url, selected.source ?? "linkareer")
      .then((detail) => {
        detailCacheRef.current.set(selected.id, detail);
        setSelected((prev) => (prev?.id === selected.id ? { ...prev, ...detail } : prev));
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [selected?.id]);

  // Scroll selected item into view
  useEffect(() => {
    if (!selected) return;
    listItemRefs.current.get(selected.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected?.id]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && !loadingRef.current) {
          const next = currentPageRef.current + 1;
          loadRef.current(next, false, currentFiltersRef.current);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Keyboard navigation (arrow keys)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isTypingTarget(event.target)) return;
      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;
      event.preventDefault();
      const currentIndex = selectedRef.current
        ? currentItems.findIndex((item) => item.id === selectedRef.current?.id)
        : -1;
      if (event.key === "ArrowRight" && currentIndex === currentItems.length - 1 && hasMoreRef.current && !loadingRef.current) {
        selectFirstNewItemAfterLoadRef.current = true;
        loadRef.current(currentPageRef.current + 1, false, currentFiltersRef.current);
        return;
      }
      const nextIndex =
        event.key === "ArrowLeft"
          ? Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)
          : Math.min(currentItems.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);
      selectPosting(currentItems[nextIndex]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectPosting]);

  const calendarPostings = useMemo(() => {
    const merged = new Map<string, JobPosting>();
    for (const posting of popularPostings) merged.set(posting.id, posting);
    for (const posting of favoritePostings) {
      merged.set(posting.id, { ...(merged.get(posting.id) ?? posting), ...posting, favorite: true });
    }
    return [...merged.values()];
  }, [favoritePostings, popularPostings]);

  const visiblePopularPostings = useMemo(
    () => calendarPostings.filter((p) => matchesPopularCategory(p, popularCategoryFilter)),
    [calendarPostings, popularCategoryFilter],
  );

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);

  const calendarEventsByDate = useMemo(() => {
    const events = new Map<string, CalendarEvent[]>();
    for (const posting of visiblePopularPostings) {
      const startDate = getStartDate(posting);
      const endDate = getDeadlineDate(posting);
      const candidates: Array<{ kind: CalendarEventKind; date: Date | null }> = [
        { kind: "start", date: startDate },
        { kind: "end", date: endDate },
      ];
      for (const candidate of candidates) {
        if (!candidate.date || Number.isNaN(candidate.date.getTime())) continue;
        const key = toDateKey(candidate.date);
        const list = events.get(key) ?? [];
        list.push({ key: `${posting.id}-${candidate.kind}`, kind: candidate.kind, posting });
        events.set(key, list);
      }
    }
    for (const list of events.values()) {
      list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "end" ? -1 : 1;
        return a.posting.company.localeCompare(b.posting.company, "ko");
      });
    }
    return events;
  }, [visiblePopularPostings]);

  return {
    items,
    total,
    loading,
    hasMore,
    filterOptions,
    selected,
    detailLoading,
    popularPostings,
    popularLoading,
    popularCategoryFilter,
    setPopularCategoryFilter,
    calendarMonth,
    visiblePopularPostings,
    calendarDays,
    calendarEventsByDate,
    isHeaderHidden,
    isFiltersHidden,
    search,
    setSearch,
    sourceFilter,
    handleSourceChange,
    companyTypeFilter,
    setCompanyTypeFilter,
    typeFilter,
    setTypeFilter,
    categoryFilter,
    setCategoryFilter,
    sortOrder,
    setSortOrder,
    loaderRef,
    listItemRefs,
    selectPosting,
    clearSelected,
    toggleFavorite,
    handleListScroll,
    handleDetailScroll,
    moveCalendarMonth,
    reload,
  };
}
