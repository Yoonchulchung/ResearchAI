"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getCompanyAnalysis,
  type CompanyAnalysis,
} from "@/lib/api/company-analysis";
import {
  getCompany,
  getCompanyNews,
  getSavedCompanyNews,
  refreshCompanyMissingStream,
  resetCompanyNews,
  scrapeHistoricalNewsStream,
  stopHistoricalNewsScrape,
  type CompanyRefreshMissingProgressEvent,
  type CompanyListItem,
  type CompanyNewsItem,
  type ScrapeHistoricalProgressEvent,
} from "@/lib/api/companies";
import {
  listJobPostings,
  type JobPosting,
} from "@/lib/api/recruit/job-posting";
import { recruitSearch } from "@/lib/recruit-search";

export type TabKey = "overview" | "jobs" | "stock" | "analysis" | "news";
export type CompanyJobType = "인턴" | "신입" | "경력";
export type MissingRefreshSourceStatus =
  | "pending"
  | "running"
  | "success"
  | "empty"
  | "error"
  | "skipped";

export interface MissingRefreshSourceProgress {
  source: "dart" | "jobkorea" | "jasoseol" | "jobplanet" | "namu-wiki";
  label: string;
  status: MissingRefreshSourceStatus;
  message: string;
}

export interface MissingRefreshProgress {
  completed: number;
  total: number;
  percent: number;
  message: string;
  sources: MissingRefreshSourceProgress[];
}

const DEFAULT_JOB_TYPES: CompanyJobType[] = ["인턴", "신입", "경력"];
const DEFAULT_MISSING_REFRESH_SOURCES: MissingRefreshSourceProgress[] = [
  { source: "dart", label: "DART", status: "pending", message: "대기 중" },
  { source: "jobkorea", label: "JobKorea", status: "pending", message: "대기 중" },
  { source: "jasoseol", label: "Jasoseol", status: "pending", message: "대기 중" },
  { source: "jobplanet", label: "JobPlanet", status: "pending", message: "대기 중" },
  { source: "namu-wiki", label: "NamuWiki", status: "pending", message: "공공기관 후보일 때만 조회" },
];

function mergeNewsByUrl(prev: CompanyNewsItem[], next: CompanyNewsItem[]) {
  const seen = new Set(prev.map((item) => item.url));
  const merged = [...prev];
  let added = 0;
  for (const item of next) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    merged.push(item);
    added += 1;
  }
  return { merged, added };
}

function makeMissingRefreshProgress(
  event: CompanyRefreshMissingProgressEvent,
  previous?: MissingRefreshProgress | null,
): MissingRefreshProgress {
  const total = event.total || previous?.total || 6;
  const completed = Math.max(0, Math.min(total, event.completed ?? previous?.completed ?? 0));
  const sources = previous?.sources ?? DEFAULT_MISSING_REFRESH_SOURCES;
  const nextSources =
    event.type === "source"
      ? sources.some((item) => item.source === event.source)
        ? sources.map((item) =>
            item.source === event.source
              ? {
                  ...item,
                  label: event.label,
                  status: event.status,
                  message: event.message,
                }
              : item,
          )
        : [
            ...sources,
            {
              source: event.source,
              label: event.label,
              status: event.status,
              message: event.message,
            },
          ]
      : sources;

  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    message: event.message,
    sources: nextSources,
  };
}

function formatNewsScrapeProgressMessage(
  event: ScrapeHistoricalProgressEvent,
): string {
  if (event.type === "window") {
    return `${event.dateFrom} ~ ${event.dateTo} 구간 검색 중 (${event.attempt}/${event.maxAttempts})`;
  }
  if (event.type === "query") {
    return `검색어 "${event.query}" 확인 중`;
  }
  if (event.type === "page") {
    const page = Math.floor((event.start - 1) / 10) + 1;
    return `"${event.query}" ${page}페이지: 검색 ${event.fetched}건, 제목 제외 ${event.rejectedByTitle}건, 신규 후보 ${event.added}건, 누적 ${event.totalFetched}건`;
  }
  return event.message;
}

function formatNewsScrapeResultMessage(result: {
  dateFrom: string;
  dateTo: string;
  saved: number;
  reachedStopDate: boolean;
}) {
  if (result.reachedStopDate) {
    return result.saved > 0
      ? `${result.dateFrom} ~ ${result.dateTo} 구간에서 지정한 마지막 날짜까지 확인했고 신규 ${result.saved}건을 찾았습니다.`
      : `${result.dateFrom} ~ ${result.dateTo} 구간에서 지정한 마지막 날짜까지 확인했지만 새로 저장할 뉴스가 없었습니다.`;
  }
  return result.saved > 0
    ? `${result.dateFrom} ~ ${result.dateTo} 구간에서 신규 ${result.saved}건을 찾았습니다.`
    : `${result.dateFrom} ~ ${result.dateTo} 구간에서 새로 저장할 뉴스가 없었습니다.`;
}

export function useCompanyDetailData(companyId: string) {
  const [company, setCompany] = useState<CompanyListItem | null>(null);
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [jobSearchCount, setJobSearchCount] = useState(0);
  const [selectedJobTypes, setSelectedJobTypes] =
    useState<CompanyJobType[]>(DEFAULT_JOB_TYPES);
  const [news, setNews] = useState<CompanyNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsFetched, setNewsFetched] = useState(false);
  const [newsHasMore, setNewsHasMore] = useState(true);
  const [savedNews, setSavedNews] = useState<CompanyNewsItem[]>([]);
  const [savedNewsLoaded, setSavedNewsLoaded] = useState(false);
  const [savedNewsOffset, setSavedNewsOffset] = useState(0);
  const [savedNewsHasMore, setSavedNewsHasMore] = useState(true);
  const [savedNewsLoadingMore, setSavedNewsLoadingMore] = useState(false);
  const [newsResetting, setNewsResetting] = useState(false);
  const [olderNewsLoading, setOlderNewsLoading] = useState(false);
  const [olderNewsStopping, setOlderNewsStopping] = useState(false);
  const [olderNewsMessage, setOlderNewsMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missingRefreshProgress, setMissingRefreshProgress] =
    useState<MissingRefreshProgress | null>(null);
  const [error, setError] = useState("");

  // 1. 기업 정보 및 분석 보고서 로드
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextCompany = await getCompany(companyId);
        if (cancelled) return;
        setCompany(nextCompany);

        const key =
          nextCompany?.analysisCompanyKey ?? nextCompany?.normalizedName;
        if (nextCompany?.hasAnalysis && key) {
          try {
            const nextAnalysis = await getCompanyAnalysis(key);
            if (!cancelled) setAnalysis(nextAnalysis);
          } catch {
            if (!cancelled) setAnalysis(null);
          }
        } else {
          setAnalysis(null);
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "기업 정보를 불러오지 못했습니다.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const PAGE_SIZE = 50;

  useEffect(() => {
    setNews([]);
    setNewsFetched(false);
    setNewsHasMore(true);
    setSavedNews([]);
    setSavedNewsLoaded(false);
    setSavedNewsOffset(0);
    setSavedNewsHasMore(true);
    setSavedNewsLoadingMore(false);
    setNewsResetting(false);
    setOlderNewsLoading(false);
    setOlderNewsStopping(false);
    setOlderNewsMessage("");
  }, [companyId]);

  // 2. 저장된 뉴스 로드
  const loadSavedNews = useCallback(async (id: string) => {
    try {
      const items = await getSavedCompanyNews(id, PAGE_SIZE, 0);
      setSavedNews(items);
      setSavedNewsOffset(PAGE_SIZE);
      setSavedNewsHasMore(items.length >= PAGE_SIZE);
      setSavedNewsLoaded(true);
    } catch {
      setSavedNewsLoaded(true);
    }
  }, []);

  const loadMoreSavedNews = useCallback(async (id: string) => {
    if (savedNewsLoadingMore || !savedNewsHasMore) return;
    setSavedNewsLoadingMore(true);
    try {
      const items = await getSavedCompanyNews(id, PAGE_SIZE, savedNewsOffset);
      setSavedNews((prev) => mergeNewsByUrl(prev, items).merged);
      setSavedNewsOffset((prev) => prev + PAGE_SIZE);
      setSavedNewsHasMore(items.length >= PAGE_SIZE);
    } catch {
      // ignore
    } finally {
      setSavedNewsLoadingMore(false);
    }
  }, [savedNewsLoadingMore, savedNewsHasMore, savedNewsOffset]);

  // 뉴스 탭 전환 시 저장된 뉴스 자동 로드
  useEffect(() => {
    if (activeTab === "news" && companyId && !savedNewsLoaded) {
      loadSavedNews(companyId);
    }
  }, [activeTab, companyId, savedNewsLoaded, loadSavedNews]);

  // 3. 채용공고 로드
  useEffect(() => {
    if (!company?.name) return;
    if (selectedJobTypes.length === 0) {
      setJobPostings([]);
      setJobsTotal(0);
      setJobsLoading(false);
      return;
    }
    const companyName = company.name;
    const jobTypes = selectedJobTypes.join(",");
    let cancelled = false;
    async function loadJobs() {
      setJobsLoading(true);
      try {
        const result = await listJobPostings({
          company: companyName,
          page: 1,
          limit: 12,
          sort: "deadline",
          type: jobTypes,
        });
        if (!cancelled) {
          setJobPostings(result.items);
          setJobsTotal(result.total);
        }
      } catch {
        if (!cancelled) {
          setJobPostings([]);
          setJobsTotal(0);
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    }
    loadJobs();
    return () => {
      cancelled = true;
    };
  }, [company?.name, selectedJobTypes]);

  const toggleJobType = useCallback((type: CompanyJobType) => {
    setSelectedJobTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : DEFAULT_JOB_TYPES.filter(
            (item) => item === type || current.includes(item),
          ),
    );
  }, []);

  // 4. 채용공고 실시간 검색
  const handleJobSearch = useCallback(async () => {
    if (!company || jobSearchLoading) return;
    setJobSearchLoading(true);
    setJobSearchCount(0);
    try {
      const { collected } = await recruitSearch(company.name, {
        onProgress: ({ collected }) => setSearchCount(collected),
      });
      if (collected > 0 && selectedJobTypes.length > 0) {
        const result = await listJobPostings({
          company: company.name,
          page: 1,
          limit: 12,
          sort: "deadline",
          type: selectedJobTypes.join(","),
        });
        setJobPostings(result.items);
        setJobsTotal(result.total);
      }
    } catch {
      // 실패 시 무시
    } finally {
      setJobSearchLoading(false);
    }
  }, [company, jobSearchLoading, selectedJobTypes]);

  // set job search count helper
  const setSearchCount = (val: number) => {
    setJobSearchCount(val);
  };

  // 5. 뉴스 실시간 수집
  const handleFetchNews = useCallback(async (stopDate?: string) => {
    if (!company || newsLoading || olderNewsLoading) return;
    setOlderNewsLoading(true);
    setOlderNewsStopping(false);
    setOlderNewsMessage("뉴스 수집을 준비 중입니다.");
    try {
      const result = await scrapeHistoricalNewsStream(
        company.id,
        company.name,
        (event) => {
          setOlderNewsMessage(formatNewsScrapeProgressMessage(event));
        },
        stopDate,
      );
      await loadSavedNews(company.id);
      setNews([]);
      setNewsHasMore(result.hasMore);
      setNewsFetched(true);
      setOlderNewsMessage(formatNewsScrapeResultMessage(result));
    } catch (e) {
      setNewsFetched(true);
      setOlderNewsMessage(
        e instanceof Error ? e.message : "뉴스를 수집하지 못했습니다.",
      );
    } finally {
      setOlderNewsLoading(false);
      setOlderNewsStopping(false);
    }
  }, [company, loadSavedNews, newsLoading, olderNewsLoading]);

  const handleFetchMoreNews = useCallback(async () => {
    if (!company || newsLoading) return;
    setNewsLoading(true);
    try {
      const items = await getCompanyNews(company.id, 100, 0, true);
      const next = mergeNewsByUrl(news, items);
      setNews(next.merged);
      setNewsHasMore(true);
      await loadSavedNews(company.id);
      setNewsFetched(true);
    } catch {
      setNewsFetched(true);
    } finally {
      setNewsLoading(false);
    }
  }, [company, loadSavedNews, news, newsLoading]);

  const handleFindOlderNews = useCallback(async (stopDate?: string) => {
    if (!company || olderNewsLoading) return;
    setOlderNewsLoading(true);
    setOlderNewsStopping(false);
    setOlderNewsMessage("이전 뉴스 수집을 준비 중입니다.");
    try {
      const result = await scrapeHistoricalNewsStream(
        company.id,
        company.name,
        (event) => {
          setOlderNewsMessage(formatNewsScrapeProgressMessage(event));
        },
        stopDate,
      );
      const offset = savedNews.length;
      const items = await getSavedCompanyNews(company.id, PAGE_SIZE, offset);
      setSavedNews((prev) => mergeNewsByUrl(prev, items).merged);
      setSavedNewsOffset(offset + PAGE_SIZE);
      setSavedNewsHasMore(items.length >= PAGE_SIZE);
      setOlderNewsMessage(formatNewsScrapeResultMessage(result));
    } catch (e) {
      setOlderNewsMessage(
        e instanceof Error ? e.message : "이전 뉴스를 찾지 못했습니다.",
      );
    } finally {
      setOlderNewsLoading(false);
      setOlderNewsStopping(false);
    }
  }, [company, olderNewsLoading, savedNews.length]);

  const handleStopOlderNews = useCallback(async () => {
    if (!company || !olderNewsLoading || olderNewsStopping) return;
    setOlderNewsStopping(true);
    setOlderNewsMessage("중지 요청 중... 지금까지 찾은 뉴스까지 저장합니다.");
    try {
      const result = await stopHistoricalNewsScrape(company.id);
      if (!result.stopped) {
        setOlderNewsMessage("진행 중인 뉴스 수집이 없습니다.");
        setOlderNewsStopping(false);
      }
    } catch (e) {
      setOlderNewsMessage(
        e instanceof Error ? e.message : "뉴스 수집을 중지하지 못했습니다.",
      );
      setOlderNewsStopping(false);
    }
  }, [company, olderNewsLoading, olderNewsStopping]);

  const handleResetNews = useCallback(async () => {
    if (!company || newsLoading || olderNewsLoading || newsResetting) return;
    setNewsResetting(true);
    setOlderNewsMessage("");
    try {
      const result = await resetCompanyNews(company.id);
      setNews([]);
      setNewsFetched(false);
      setNewsHasMore(true);
      setSavedNews([]);
      setSavedNewsLoaded(true);
      setSavedNewsOffset(0);
      setSavedNewsHasMore(false);
      setOlderNewsMessage(
        `뉴스 ${result.deletedNews}건, 키워드 ${result.deletedKeywords}건, 타임라인 ${result.deletedTimeline}건을 초기화했습니다.`,
      );
    } catch (e) {
      setOlderNewsMessage(
        e instanceof Error ? e.message : "뉴스를 초기화하지 못했습니다.",
      );
    } finally {
      setNewsResetting(false);
    }
  }, [company, newsLoading, olderNewsLoading, newsResetting]);

  // 6. 결측치 재수집
  const handleRefreshMissing = useCallback(async () => {
    if (!company) return;
    const controller = new AbortController();
    setRefreshing(true);
    setError("");
    setMissingRefreshProgress({
      completed: 0,
      total: 6,
      percent: 0,
      message: "결측치 수집을 준비 중입니다.",
      sources: DEFAULT_MISSING_REFRESH_SOURCES,
    });
    try {
      await refreshCompanyMissingStream(
        company.id,
        (event) => {
          setMissingRefreshProgress((prev) =>
            makeMissingRefreshProgress(event, prev),
          );
          if (event.type === "done") setCompany(event.result);
          if (event.type === "error") setError(event.message);
        },
        controller.signal,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "결측치 재수집에 실패했습니다.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [company]);

  return {
    company,
    analysis,
    activeTab,
    setActiveTab,
    jobPostings,
    jobsTotal,
    jobsLoading,
    jobSearchLoading,
    jobSearchCount,
    selectedJobTypes,
    toggleJobType,
    news,
    newsLoading,
    newsFetched,
    newsHasMore,
    savedNews,
    savedNewsLoaded,
    savedNewsHasMore,
    savedNewsLoadingMore,
    newsResetting,
    olderNewsLoading,
    olderNewsStopping,
    olderNewsMessage,
    loading,
    refreshing,
    missingRefreshProgress,
    error,
    setError,
    handleJobSearch,
    loadSavedNews,
    loadMoreSavedNews,
    handleFetchNews,
    handleFetchMoreNews,
    handleFindOlderNews,
    handleStopOlderNews,
    handleResetNews,
    handleRefreshMissing,
  };
}
