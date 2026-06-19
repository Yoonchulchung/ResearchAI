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
  refreshCompanyMissing,
  type CompanyListItem,
  type CompanyNewsItem,
} from "@/lib/api/companies";
import {
  listJobPostings,
  type JobPosting,
} from "@/lib/api/recruit/job-posting";
import { recruitSearch } from "@/lib/recruit-search";

export type TabKey = "overview" | "jobs" | "stock" | "analysis" | "news";
export type CompanyJobType = "인턴" | "신입" | "경력";

const DEFAULT_JOB_TYPES: CompanyJobType[] = ["인턴", "신입", "경력"];

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  // 2. 저장된 뉴스 로드
  const loadSavedNews = useCallback(async (id: string, limit = 500) => {
    try {
      const items = await getSavedCompanyNews(id, limit);
      setSavedNews(items);
      setSavedNewsLoaded(true);
    } catch {
      setSavedNewsLoaded(true);
    }
  }, []);

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
  const handleFetchNews = useCallback(async () => {
    if (!company || newsLoading) return;
    const nextLimit = 12;
    setNewsLoading(true);
    try {
      const items = await getCompanyNews(company.id, nextLimit, 0);
      setNewsHasMore(true);
      setNews((prev) => mergeNewsByUrl(prev, items).merged);
      await loadSavedNews(company.id);
      setNewsFetched(true);
    } catch {
      setNewsFetched(true);
    } finally {
      setNewsLoading(false);
    }
  }, [company, loadSavedNews, newsLoading]);

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

  // 6. 결측치 재수집
  const handleRefreshMissing = useCallback(async () => {
    if (!company) return;
    setRefreshing(true);
    setError("");
    try {
      const nextCompany = await refreshCompanyMissing(company.id);
      setCompany(nextCompany);
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
    loading,
    refreshing,
    error,
    setError,
    handleJobSearch,
    loadSavedNews,
    handleFetchNews,
    handleFetchMoreNews,
    handleRefreshMissing,
  };
}
