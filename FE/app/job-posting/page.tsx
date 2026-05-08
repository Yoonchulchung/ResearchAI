"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  listJobPostings,
  startJobScraping,
  stopJobScraping,
  getJobScrapingStatus,
  fetchJobPostingDetail,
  type JobPosting,
  type JobPostingFilterOptions,
  type JobPostingListParams,
  type JobScrapingStatus,
} from "@/lib/api/job-posting";

const PAGE_SIZE = 30;
const SOURCE_LABELS: Record<string, string> = {
  "": "전체",
  linkareer: "링커리어",
  jobkorea: "잡코리아",
  catch: "캐치",
  jobplanet: "잡플래닛",
  jobda: "잡다",
};
const DEFAULT_FILTER_OPTIONS: JobPostingFilterOptions = {
  jobs: [],
  companyTypes: [],
  types: ["인턴", "신입", "경력", "신입·경력", "계약직"],
  categories: ["IT", "전자"],
};
const FILTER_STORAGE_KEY = "job-posting.filters.v1";
const SOURCE_KEYS = new Set(Object.keys(SOURCE_LABELS));

interface PersistedFilters {
  search: string;
  sourceFilter: string;
  companyTypeFilter: string;
  typeFilter: string;
  categoryFilter: string;
}

const DEFAULT_PERSISTED_FILTERS: PersistedFilters = {
  search: "",
  sourceFilter: "",
  companyTypeFilter: "",
  typeFilter: "",
  categoryFilter: "",
};

const readPersistedFilters = (): PersistedFilters => {
  if (typeof window === "undefined") return DEFAULT_PERSISTED_FILTERS;
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    return {
      search: parsed.search ?? "",
      sourceFilter: SOURCE_KEYS.has(parsed.sourceFilter ?? "") ? parsed.sourceFilter ?? "" : "",
      companyTypeFilter: parsed.companyTypeFilter ?? "",
      typeFilter: parsed.typeFilter ?? "",
      categoryFilter: parsed.categoryFilter ?? "",
    };
  } catch {
    return DEFAULT_PERSISTED_FILTERS;
  }
};

const persistFilters = (filters: PersistedFilters) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};

const getDeadlineDate = (posting: JobPosting) => {
  const raw = posting.endDate || posting.deadline;
  if (!raw) return null;

  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));

  const fullDateMatch = raw.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (fullDateMatch) {
    return new Date(Number(fullDateMatch[1]), Number(fullDateMatch[2]) - 1, Number(fullDateMatch[3]));
  }

  const monthDayMatch = raw.match(/(\d{1,2})[./](\d{1,2})/);
  if (monthDayMatch) {
    const today = new Date();
    return new Date(today.getFullYear(), Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]));
  }

  return null;
};

const getDdayLabel = (posting: JobPosting) => {
  if (/상시|채용 시|수시/.test(posting.deadline ?? "")) return null;

  const deadline = getDeadlineDate(posting);
  if (!deadline || Number.isNaN(deadline.getTime())) return null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const deadlineStart = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
  const diffDays = Math.ceil((deadlineStart - todayStart) / 86_400_000);

  if (diffDays < 0) return "마감";
  if (diffDays === 0) return "D-Day";
  return `D-${diffDays}`;
};

export default function JobPostingPage() {
  const router = useRouter();

  const [items, setItems] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filterOptions, setFilterOptions] = useState<JobPostingFilterOptions>(DEFAULT_FILTER_OPTIONS);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [companyTypeFilter, setCompanyTypeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const persisted = readPersistedFilters();
    setSearch(persisted.search);
    setSourceFilter(persisted.sourceFilter);
    setCompanyTypeFilter(persisted.companyTypeFilter);
    setTypeFilter(persisted.typeFilter);
    setCategoryFilter(persisted.categoryFilter);
    setIsReady(true);
  }, []);
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailCacheRef = useRef<Map<string, Partial<JobPosting>>>(new Map());
  const itemsRef = useRef<JobPosting[]>([]);
  const selectedRef = useRef<JobPosting | null>(null);

  const [status, setStatus] = useState<JobScrapingStatus | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeSource, setScrapeSource] = useState<"linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all">("all");
  const [linkareerJobType, setLinkareerJobType] = useState<"INTERN" | "RECRUIT">("INTERN");

  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestSeqRef = useRef(0);
  const currentFiltersRef = useRef<JobPostingListParams>({});
  const currentPageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const selectFirstNewItemAfterLoadRef = useRef(false);

  itemsRef.current = items;
  selectedRef.current = selected;

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
      setItems((prev) => {
        if (reset) return res.items;
        if (selectFirstNewItemAfterLoadRef.current && res.items.length > 0) {
          setSelected(res.items[0]);
          selectFirstNewItemAfterLoadRef.current = false;
        }
        return [...prev, ...res.items];
      });
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

  const buildFilters = (): JobPostingListParams => ({
    source: sourceFilter || undefined,
    search: search.trim() || undefined,
    companyType: companyTypeFilter || undefined,
    type: typeFilter === "신입/인턴" ? "신입,인턴" : (typeFilter || undefined),
    category: categoryFilter || undefined,
  });

  const handleSourceChange = (src: string) => {
    setSourceFilter(src);
  };

  useEffect(() => {
    getJobScrapingStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const filters = buildFilters();
    persistFilters({ search, sourceFilter, companyTypeFilter, typeFilter, categoryFilter });
    currentFiltersRef.current = filters;
    setSelected(null);
    setPage(1);
    setItems([]);
    setHasMore(true);
    hasMoreRef.current = true;
    loadRef.current(1, true, filters);
  }, [sourceFilter, search, companyTypeFilter, typeFilter, categoryFilter]);

  useEffect(() => {
    if (status?.running) {
      statusTimerRef.current = setInterval(async () => {
        try {
          const s = await getJobScrapingStatus();
              setStatus(s);
              if (!s.running) {
                clearInterval(statusTimerRef.current!);
                loadRef.current(1, true, currentFiltersRef.current);
              }
            } catch {}
      }, 2000);
    }
    return () => { if (statusTimerRef.current) clearInterval(statusTimerRef.current); };
  }, [status?.running]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMoreRef.current && !loadingRef.current) {
        const next = currentPageRef.current + 1;
        setPage(next);
        loadRef.current(next, false, currentFiltersRef.current);
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const cached = detailCacheRef.current.get(selected.id);
    if (cached) {
      setSelected((prev) => prev ? { ...prev, ...cached } : prev);
      return;
    }
    setDetailLoading(true);
    fetchJobPostingDetail(selected.id, selected.url, selected.source ?? "linkareer")
      .then((detail) => {
        detailCacheRef.current.set(selected.id, detail);
        setSelected((prev) => prev?.id === selected.id ? { ...prev, ...detail } : prev);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [selected?.id]);

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
      if (
        event.key === "ArrowRight" &&
        currentIndex === currentItems.length - 1 &&
        hasMoreRef.current &&
        !loadingRef.current
      ) {
        selectFirstNewItemAfterLoadRef.current = true;
        const next = currentPageRef.current + 1;
        setPage(next);
        loadRef.current(next, false, currentFiltersRef.current);
        return;
      }

      const nextIndex = event.key === "ArrowLeft"
        ? Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)
        : Math.min(currentItems.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);

      setSelected(currentItems[nextIndex]);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleStart = async () => {
    setScrapeLoading(true);
    try {
      await startJobScraping(
        scrapeSource === "all"         ? { source: "all" }
        : scrapeSource === "jobkorea"  ? { source: "jobkorea" }
        : scrapeSource === "catch"     ? { source: "catch" }
        : scrapeSource === "jobplanet" ? { source: "jobplanet" }
        : scrapeSource === "jobda"     ? { source: "jobda" }
        : { source: "linkareer", jobType: linkareerJobType }
      );
      const s = await getJobScrapingStatus();
      setStatus(s);
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleStop = async () => {
    setScrapeLoading(true);
    try {
      await stopJobScraping();
      const s = await getJobScrapingStatus();
      setStatus(s);
      loadRef.current(1, true, currentFiltersRef.current);
    } finally {
      setScrapeLoading(false);
    }
  };

  const normalizeType = (t: string) => {
    if (/^NEW$/i.test(t)) return "신입";
    if (/^EXPERIENCED$/i.test(t)) return "경력";
    if (/^CONTRACT$/i.test(t)) return "계약직";
    if (/인턴|intern/i.test(t)) return "인턴";
    if (/신입/.test(t) && /경력/.test(t)) return "신입·경력";
    if (/신입/.test(t)) return "신입";
    if (/경력/.test(t)) return "경력";
    if (/계약/.test(t)) return "계약직";
    return t;
  };

  const companyTypeOptions = filterOptions.companyTypes;
  const typeOptions = ["신입", "인턴"];
  const categoryOptions = filterOptions.categories;
  const selectedDday = selected ? getDdayLabel(selected) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F4F5F7]">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Topbar */}
        <div className="shrink-0 flex flex-col px-4 sm:px-6 py-3 bg-white border-b border-slate-200/80 shadow-sm z-10">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              돌아가기
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
            <span className="text-base font-bold text-slate-800 tracking-tight shrink-0">채용 공고</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-500 shrink-0">{total.toLocaleString()}건</span>
            <div className="flex-1" />
            {status?.running ? (
              <button
                onClick={handleStop}
                disabled={scrapeLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all disabled:opacity-50 bg-white text-red-600 border-red-200 hover:bg-red-50 shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor"/>
                </svg>
                <span className="hidden sm:inline">수집 중단</span>
                <span className="sm:hidden">중단</span>
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={scrapeLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all disabled:opacity-50 bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm shrink-0"
              >
                {scrapeLoading ? (
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 1.5L9.5 6L2.5 10.5V1.5Z" fill="currentColor"/>
                  </svg>
                )}
                크롤링 시작
              </button>
            )}
          </div>
          {/* Controls row */}
          {status?.running ? (
            <div className="flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-600 font-medium border border-emerald-100 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              수집 중 {status.totalCollected.toLocaleString()}건 · p.{status.currentPage}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-0.5 scrollbar-hide">
              {scrapeSource === "linkareer" && (
                <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-semibold bg-white shrink-0">
                  {(["INTERN", "RECRUIT"] as const).map((jt) => (
                    <button
                      key={jt}
                      onClick={() => setLinkareerJobType(jt)}
                      className={`px-2.5 py-1 transition-colors ${
                        linkareerJobType === jt
                          ? "bg-slate-100 text-slate-800"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {jt === "INTERN" ? "인턴" : "신입공채"}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-semibold bg-white shrink-0">
                {(["all", "linkareer", "jobkorea", "catch", "jobplanet", "jobda"] as const).map((src) => (
                  <button
                    key={src}
                    onClick={() => setScrapeSource(src)}
                    className={`px-2.5 py-1 transition-colors ${
                      scrapeSource === src
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {src === "all" ? "전체" : SOURCE_LABELS[src]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* Left: list */}
          <div className={`${selected ? "hidden md:flex" : "flex"} flex-col w-full md:w-[420px] shrink-0 border-r border-slate-200/80 bg-white overflow-hidden z-0`}>

            {/* Search + filters */}
            <div className="shrink-0 p-4 border-b border-slate-200/80 flex flex-col gap-3 bg-slate-50/50">

              {/* Source tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {(["", "linkareer", "jobkorea", "catch", "jobplanet", "jobda"] as const).map((src) => (
                  <button
                    key={src}
                    onClick={() => handleSourceChange(src)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors border ${
                      sourceFilter === src
                        ? "bg-white border-indigo-200 text-indigo-700 shadow-sm"
                        : "bg-transparent border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    {SOURCE_LABELS[src]}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="기업명, 공고명, 지역, 직무 검색"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                />
              </div>

              {/* Type Category (신입/인턴/경력) */}
              <div className="flex p-1 rounded-lg bg-slate-100 border border-slate-200/60 overflow-x-auto scrollbar-hide">
                {(["", "신입", "인턴", "신입/인턴", "경력"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`shrink-0 flex-1 px-2 py-1.5 text-[13px] font-bold rounded-md transition-all whitespace-nowrap ${
                      typeFilter === t
                        ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent"
                    }`}
                  >
                    {t === "" ? "전체" : t}
                  </button>
                ))}
              </div>

              {/* Company Types (Multi-select) */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {companyTypeOptions.length > 0 && companyTypeOptions.map(c => {
                  const arr = companyTypeFilter ? companyTypeFilter.split(',') : [];
                  const isSelected = arr.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        if (isSelected) {
                          setCompanyTypeFilter(arr.filter(x => x !== c).join(','));
                        } else {
                          setCompanyTypeFilter([...arr, c].join(','));
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                        isSelected
                          ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              {/* Category Dropdown */}
              {categoryOptions.length > 0 && (
                <div className="mt-1">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-sm appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center" }}
                  >
                    <option value="">직무분야 전체</option>
                    {categoryOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-50/30">
              {items.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <rect x="6" y="6" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4"/>
                    <path d="M13 16h14M13 22h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm font-medium">조회된 공고가 없습니다</p>
                </div>
              )}
              {items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`w-full text-left p-4 border-b transition-all group ${
                    selected?.id === p.id
                      ? "bg-indigo-50/60 border-indigo-100 shadow-[inset_3px_0_0_0_#4f46e5]"
                      : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className={`text-xs font-bold truncate ${selected?.id === p.id ? "text-indigo-900" : "text-slate-700 group-hover:text-slate-900"}`}>
                          {p.company}
                        </p>
                        {(!p.source || p.source === "linkareer") && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-bold tracking-wide">링커리어</span>
                        )}
                        {p.source === "jobkorea" && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-bold tracking-wide">잡코리아</span>
                        )}
                        {p.source === "catch" && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-bold tracking-wide">캐치</span>
                        )}
                        {p.source === "jobplanet" && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-bold tracking-wide">잡플래닛</span>
                        )}
                        {p.source === "jobda" && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-bold tracking-wide">잡다</span>
                        )}
                      </div>
                      <p className={`text-[15px] font-semibold line-clamp-2 leading-snug mb-2 ${selected?.id === p.id ? "text-indigo-950" : "text-slate-900"}`}>
                        {p.title}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    {p.type && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium border border-slate-200/60">
                        {normalizeType(p.type)}
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      {p.location && <span className="flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1C3 1 1.5 2.5 1.5 4.5C1.5 7 5 9.5 5 9.5C5 9.5 8.5 7 8.5 4.5C8.5 2.5 7 1 5 1ZM5 5.5C4.44772 5.5 4 5.05228 4 4.5C4 3.94772 4.44772 3.5 5 3.5C5.55228 3.5 6 3.94772 6 4.5C6 5.05228 5.55228 5.5 5 5.5Z" fill="currentColor"/></svg>{p.location}</span>}
                      {p.location && p.deadline && <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />}
                      {p.deadline && <span className="flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1.5" y="2" width="7" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 1V2.5M6.5 1V2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>{p.deadline}</span>}
                    </div>
                  </div>
                </button>
              ))}
              <div ref={loaderRef} className="py-6 flex justify-center">
                {loading && (
                  <span className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin block" />
                )}
              </div>
            </div>
          </div>

          {/* Right: detail */}
          <div className={`flex-1 overflow-y-auto ${selected ? "flex" : "hidden md:flex"} flex-col bg-[#F8F9FA]`}>
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center mb-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-base font-medium text-slate-500">공고를 선택하시면 상세 정보를 볼 수 있습니다</p>
              </div>
            ) : (
              <div className="p-8 max-w-3xl w-full mx-auto">
                {/* Mobile back */}
                <button
                  onClick={() => setSelected(null)}
                  className="md:hidden flex items-center gap-1.5 text-sm mb-6 text-slate-500 hover:text-slate-800 font-medium transition-colors bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm w-fit"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  목록으로 돌아가기
                </button>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  {/* Header */}
                  <div className="p-8 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                      {selected.type && (
                        <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {normalizeType(selected.type)}
                        </span>
                      )}
                      {selectedDday && (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                          selectedDday === "마감"
                            ? "bg-slate-50 text-slate-500 border-slate-200"
                            : selectedDday === "D-Day"
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-amber-50 text-amber-600 border-amber-200"
                        }`}>
                          {selectedDday}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-500 mb-2 tracking-wide">{selected.company}</p>
                    <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight mb-5 text-slate-900 tracking-tight">
                      {selected.title}
                    </h1>
                    
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium text-slate-600">
                      {selected.location && (
                        <span className="flex items-center gap-1.5">
                          <svg className="text-slate-400" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5c-3.3 0-6 2.7-6 6 0 3.8 6 7.5 6 7.5s6-3.7 6-7.5c0-3.3-2.7-6-6-6zm0 8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor"/></svg>
                          {selected.location}
                        </span>
                      )}
                      {(selected.startDate || selected.endDate) ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="text-slate-400" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1.5v3M11 1.5v3M2 6.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          {selected.startDate} ~ {selected.endDate}
                        </span>
                      ) : selected.deadline && (
                        <span className="flex items-center gap-1.5">
                          <svg className="text-slate-400" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1.5v3M11 1.5v3M2 6.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          {selected.deadline}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-8">
                    {/* Info grid */}
                    {(selected.companyType || selected.jobs || selected.homepage) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 p-5 rounded-xl bg-slate-50 border border-slate-100">
                        {selected.companyType && (
                          <div>
                            <p className="text-[13px] font-semibold text-slate-400 mb-1">기업형태</p>
                            <p className="font-bold text-slate-800">{selected.companyType}</p>
                          </div>
                        )}
                        {selected.jobs && (
                          <div>
                            <p className="text-[13px] font-semibold text-slate-400 mb-1">모집직무</p>
                            <p className="font-bold text-slate-800">{selected.jobs}</p>
                          </div>
                        )}
                        {selected.homepage && (
                          <div className="sm:col-span-2 mt-1 pt-4 border-t border-slate-200/60">
                            <p className="text-[13px] font-semibold text-slate-400 mb-1">홈페이지</p>
                            <a href={selected.homepage.startsWith('http') ? selected.homepage : `https://${selected.homepage}`} target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline break-all">
                              {selected.homepage}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Category */}
                    {selected.category && !selected.jobs && (
                      <div className="mb-8">
                        <p className="text-[13px] font-bold text-indigo-600 mb-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                          직무 분야
                        </p>
                        <p className="text-[15px] font-medium text-slate-700 pl-3.5 border-l-2 border-indigo-100">{selected.category}</p>
                      </div>
                    )}

                    {/* Detail content */}
                    <div className="mb-10">
                      <p className="text-[15px] font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">상세내용</p>
                      {detailLoading ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                          <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                          상세 내용을 불러오는 중...
                        </div>
                      ) : selected.detailHtml ? (
                        <div
                          className="job-detail-html text-[15px] leading-relaxed text-slate-700"
                          dangerouslySetInnerHTML={{ __html: selected.detailHtml }}
                        />
                      ) : selected.detailContent ? (
                        <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700 font-medium">
                          {selected.detailContent}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">상세 내용을 가져올 수 없습니다. 원본 공고를 확인해주세요.</p>
                      )}
                    </div>

                    {/* Action */}
                    <div className="pt-6 border-t border-slate-100 flex justify-end">
                      <a
                        href={selected.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md transition-all w-full sm:w-auto"
                      >
                        {selected.source === "jobkorea" ? "잡코리아에서 공고 보기"
                        : selected.source === "catch" ? "캐치에서 공고 보기"
                        : selected.source === "jobplanet" ? "잡플래닛에서 공고 보기"
                        : selected.source === "jobda" ? "잡다에서 공고 보기"
                        : "링커리어에서 공고 보기"}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 11.5L11.5 2.5M11.5 2.5H5.5M11.5 2.5V8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
