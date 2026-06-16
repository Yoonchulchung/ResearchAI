"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { getCompanyAnalysis, type CompanyAnalysis } from "@/lib/api/company-analysis";
import { getCompany, getCompanyNews, getSavedCompanyNews, refreshCompanyMissing, type CompanyListItem, type CompanyNewsItem } from "@/lib/api/companies";
import { StockChart } from "@/companies/_components/StockChart";
import { FinancialSection } from "@/companies/_components/FinancialSection";
import { InvestorTrading } from "@/companies/_components/InvestorTrading";
import { listJobPostings, type JobPosting } from "@/lib/api/recruit/job-posting";
import { recruitSearch } from "@/lib/recruit-search";
import type { YearlyFinancial } from "@/lib/api/company-analysis";

type TabKey = "overview" | "jobs" | "stock" | "analysis" | "news";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "jobs", label: "채용공고" },
  { key: "news", label: "뉴스" },
  { key: "stock", label: "주식" },
  { key: "analysis", label: "핵심 기업분석" },
];

function valueOrDash(value?: string | null) {
  return value?.trim() || "-";
}

function firstChar(name?: string | null) {
  return (name?.trim()?.[0] ?? "C").toUpperCase();
}

function compactDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function splitTags(company: CompanyListItem, analysis: CompanyAnalysis | null) {
  const raw = [
    analysis?.industry,
    analysis?.companySize,
    company.companyType,
    company.source ? `${company.source} 수집` : null,
    ...company.sources.map((source) => `${source}`),
  ].filter(Boolean) as string[];
  return [...new Set(raw)].slice(0, 6);
}

function formatEmployees(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const num = parseInt(value.replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return value;
  return `${num.toLocaleString("ko-KR")}명`;
}

function formatFoundedDate(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const m = value.match(/(\d{4})/);
  if (!m) return value;
  const year = parseInt(m[1], 10);
  if (year < 1800 || year > 2100) return value;
  const rest = value.replace(m[1], "").replace(/[-./]/g, "").trim();
  if (rest.length >= 4) {
    const month = parseInt(rest.slice(0, 2), 10);
    const day = parseInt(rest.slice(2, 4), 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}년 ${month}월 ${day}일`;
    }
  }
  return `${year}년`;
}

function latestRevenue(analysis: CompanyAnalysis | null, company: CompanyListItem): string | null {
  if (company.revenue?.trim()) return company.revenue;
  const sorted = analysis?.multiYearFinancials?.slice().sort((a, b) => b.year - a.year);
  return sorted?.[0]?.revenueFormatted ?? null;
}

function infoRows(company: CompanyListItem, analysis: CompanyAnalysis | null): [string, string | null | undefined][] {
  return [
    ["산업(업종)", analysis?.industry ?? company.industry],
    ["기업 형태", analysis?.companySize ?? company.companyType],
    ["대표자", analysis?.ceoName ?? company.ceoName],
    ["사원수", formatEmployees(analysis?.employees ?? company.employees)],
    ["매출액", latestRevenue(analysis, company)],
    ["설립 년도", formatFoundedDate(analysis?.foundedDate ?? company.foundedDate)],
    ["주소지", analysis?.address ?? company.address],
    ["홈페이지", analysis?.homeUrl ?? company.homeUrl],
  ];
}

function latestPointers(analysis: CompanyAnalysis | null) {
  if (!analysis) return [];
  const points: string[] = [];
  if (analysis.industry) points.push(`${analysis.industry} 산업 동향과 기업 포지션을 함께 확인해 보세요.`);
  if (analysis.summary) points.push(analysis.summary);
  if (analysis.swot?.S?.[0]) points.push(`강점: ${analysis.swot.S[0]}`);
  if (analysis.swot?.O?.[0]) points.push(`기회: ${analysis.swot.O[0]}`);
  if (analysis.report) points.push(analysis.report.split("\n").find((line) => line.trim().length > 20)?.trim() ?? analysis.report.slice(0, 160));
  return points.filter(Boolean).slice(0, 4);
}

function sourceLabel(source?: string | null) {
  const map: Record<string, string> = {
    linkareer: "링커리어",
    jobkorea: "잡코리아",
    catch: "캐치",
    jobplanet: "잡플래닛",
    jobda: "잡다",
    saramin: "사람인",
    "saramin-api": "사람인 API",
  };
  return source ? map[source] ?? source : "출처 미상";
}

function postingDate(posting: JobPosting) {
  return posting.endDate || posting.deadline || posting.startDate || "";
}


function FinancialChart({
  data,
  isDark,
  subtleText,
  panelClass,
}: {
  data: YearlyFinancial[];
  isDark: boolean;
  subtleText: string;
  panelClass: string;
}) {
  const sorted = [...data].sort((a, b) => a.year - b.year);
  const maxVal = Math.max(...sorted.flatMap((d) => [d.revenue ?? 0, d.operatingProfit ?? 0, d.netIncome ?? 0]));
  if (maxVal === 0) return null;

  const pct = (val: number | null) =>
    val == null || val === 0 ? 0 : Math.max(5, Math.round((Math.abs(val) / maxVal) * 100));

  const metrics = [
    { key: "revenue" as const, color: isDark ? "#818cf8" : "#4f46e5", label: "매출액" },
    { key: "operatingProfit" as const, color: isDark ? "#34d399" : "#059669", label: "영업이익" },
    { key: "netIncome" as const, color: isDark ? "#fb923c" : "#ea580c", label: "당기순이익" },
  ];

  return (
    <div className={`rounded-md border p-3 ${panelClass}`}>
      {/* 범례 */}
      <div className="mb-3 flex gap-3">
        {metrics.map((m) => (
          <div key={m.key} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: m.color }} />
            <span className={`text-xs ${subtleText}`}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* 바 차트 */}
      <div className="flex items-end gap-4">
        {sorted.map((d) => (
          <div key={d.year} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-16 w-full items-end justify-center gap-1">
              {metrics.map((m) => (
                <div
                  key={m.key}
                  className="w-3 shrink-0 rounded-sm transition-all"
                  style={{ height: `${pct(d[m.key])}%`, background: m.color, opacity: 0.85 }}
                />
              ))}
            </div>
            <span className={`text-xs font-semibold ${subtleText}`}>{d.year}년</span>
          </div>
        ))}
      </div>

      {/* 수치 */}
      <div className={`mt-3 border-t pt-2 ${isDark ? "border-white/10" : "border-slate-100"}`}>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={`pb-1 text-left font-semibold ${subtleText}`}>연도</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>매출액</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>영업이익</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>순이익</th>
              <th className={`pb-1 text-right font-semibold ${subtleText}`}>영업이익률</th>
            </tr>
          </thead>
          <tbody>
            {[...sorted].reverse().map((f) => (
              <tr key={f.year} className={`border-t ${isDark ? "border-white/5" : "border-slate-50"}`}>
                <td className="py-0.5 font-bold">{f.year}년</td>
                <td className={`py-0.5 text-right ${subtleText}`}>{f.revenueFormatted ?? "-"}</td>
                <td className={`py-0.5 text-right ${subtleText}`}>{f.operatingProfitFormatted ?? "-"}</td>
                <td className={`py-0.5 text-right ${subtleText}`}>{f.netIncomeFormatted ?? "-"}</td>
                <td className={`py-0.5 text-right ${subtleText}`}>
                  {f.operatingMargin != null ? `${f.operatingMargin.toFixed(1)}%` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [company, setCompany] = useState<CompanyListItem | null>(null);
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [jobSearchCount, setJobSearchCount] = useState(0);
  const [news, setNews] = useState<CompanyNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsFetched, setNewsFetched] = useState(false);
  const [savedNews, setSavedNews] = useState<CompanyNewsItem[]>([]);
  const [savedNewsLoaded, setSavedNewsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const companyId = useMemo(() => decodeURIComponent(params.id), [params.id]);

  const pageClass = isGlass
    ? "bg-transparent"
    : isDark
      ? "bg-slate-950 text-white"
      : "bg-slate-50 text-slate-950";
  const panelClass = isGlass
    ? "glass-panel border-white/20"
    : isDark
      ? "border-white/10 bg-slate-900"
      : "border-slate-200 bg-white";
  const subtleText = isDark ? "text-white/55" : "text-slate-500";
  const mutedPanel = isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextCompany = await getCompany(companyId);
        if (cancelled) return;
        setCompany(nextCompany);

        const key = nextCompany?.analysisCompanyKey ?? nextCompany?.normalizedName;
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
        if (!cancelled) setError(e instanceof Error ? e.message : "기업 정보를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [companyId]);

  // 뉴스 탭 전환 시 저장된 뉴스 자동 로드
  useEffect(() => {
    if (activeTab === "news" && companyId && !savedNewsLoaded) {
      loadSavedNews(companyId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, companyId, savedNewsLoaded]);

  useEffect(() => {
    if (!company?.name) return;
    const companyName = company.name;
    let cancelled = false;
    async function loadJobs() {
      setJobsLoading(true);
      try {
        const result = await listJobPostings({
          company: companyName,
          page: 1,
          limit: 12,
          sort: "deadline",
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
    return () => { cancelled = true; };
  }, [company?.name]);

  const tags = company ? splitTags(company, analysis) : [];
  const rows = company ? infoRows(company, analysis) : [];
  const pointers = latestPointers(analysis);
  const homeUrl = analysis?.homeUrl ?? company?.homeUrl;

  const handleJobSearch = async () => {
    if (!company || jobSearchLoading) return;
    setJobSearchLoading(true);
    setJobSearchCount(0);
    try {
      const { collected } = await recruitSearch(company.name, {
        onProgress: ({ collected }) => setJobSearchCount(collected),
      });
      if (collected > 0) {
        const result = await listJobPostings({ company: company.name, page: 1, limit: 12, sort: "deadline" });
        setJobPostings(result.items);
        setJobsTotal(result.total);
      }
    } catch {
      // 실패 시 무시
    } finally {
      setJobSearchLoading(false);
    }
  };

  const loadSavedNews = async (id: string) => {
    try {
      const items = await getSavedCompanyNews(id, 50);
      setSavedNews(items);
      setSavedNewsLoaded(true);
    } catch {
      setSavedNewsLoaded(true);
    }
  };

  const handleFetchNews = async () => {
    if (!company || newsLoading) return;
    setNewsLoading(true);
    try {
      const items = await getCompanyNews(company.id, 12);
      setNews(items);
      setNewsFetched(true);
      // 수집 완료 후 저장된 뉴스 목록 갱신
      await loadSavedNews(company.id);
    } catch {
      setNews([]);
      setNewsFetched(true);
    } finally {
      setNewsLoading(false);
    }
  };

  const handleRefreshMissing = async () => {
    if (!company) return;
    setRefreshing(true);
    setError("");
    try {
      const nextCompany = await refreshCompanyMissing(company.id);
      setCompany(nextCompany);
    } catch (e) {
      setError(e instanceof Error ? e.message : "결측치 재수집에 실패했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <main className={`h-full overflow-y-auto ${pageClass}`}>
        <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center px-4 py-8">
          <div className={`rounded-md border px-5 py-4 text-sm ${panelClass} ${subtleText}`}>기업 정보를 불러오는 중...</div>
        </div>
      </main>
    );
  }

  if (!company) {
    return (
      <main className={`h-full overflow-y-auto ${pageClass}`}>
        <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center px-4 py-8">
          <div className={`rounded-md border p-6 text-center ${panelClass}`}>
            <h1 className="text-lg font-black">기업을 찾을 수 없습니다.</h1>
            <p className={`mt-1.5 text-sm ${subtleText}`}>{error || "목록에서 다시 선택해 주세요."}</p>
            <button onClick={() => router.push("/companies")} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white">
              기업 목록
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6">
        <button
          onClick={() => router.push("/companies")}
          className={`w-fit text-sm font-bold transition-colors ${isDark ? "text-white/60 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
        >
          ← 기업 목록
        </button>

        {/* 헤더 */}
        <section className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-md border text-2xl font-black ${mutedPanel}`}>
            {firstChar(company.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{company.name}</h1>
              <span className={`text-base font-light ${subtleText}`}>| 기업정보</span>
              {homeUrl ? (
                <a
                  href={homeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-sm p-1.5 transition-colors ${isDark ? "text-white/45 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                  aria-label="홈페이지 열기"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M10.5 13.5 13.5 10.5M8.8 10.2 7.4 11.6a4 4 0 0 0 5.66 5.66l1.4-1.4M15.2 13.8l1.4-1.4a4 4 0 0 0-5.66-5.66l-1.4 1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </a>
              ) : null}
            </div>
            <p className={`mt-1.5 text-sm ${isDark ? "text-white/70" : "text-slate-600"}`}>
              {analysis?.industry ?? company.industry ?? company.companyType ?? "기업 정보"}
            </p>
          </div>
          <button
            onClick={handleRefreshMissing}
            disabled={refreshing}
            className={`w-fit rounded-md px-3 py-2 text-xs font-bold transition-colors ${
              refreshing
                ? "cursor-wait bg-slate-300 text-slate-600"
                : isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            {refreshing ? "재수집 중..." : "결측치 크롤링"}
          </button>
        </section>

        {/* 탭 */}
        <nav className="grid grid-cols-5 border-b border-slate-200 text-center dark:border-white/10">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative py-3 text-sm font-bold transition-colors ${
                activeTab === tab.key
                  ? isDark ? "text-white" : "text-slate-950"
                  : isDark ? "text-white/45 hover:text-white" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab.label}
              {activeTab === tab.key ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-sm bg-orange-500" /> : null}
            </button>
          ))}
        </nav>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {/* 개요 탭 */}
        {activeTab === "overview" ? (
          <section className="flex flex-col gap-5">
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>한 줄 소개</p>
              <p className="mt-2 text-base leading-relaxed">
                {analysis?.summary ?? company.analysisSummary ?? `${company.name}의 기업 정보를 확인합니다.`}
              </p>
            </div>

            <div className={`rounded-md border p-4 ${panelClass}`}>
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                {rows.map(([label, value]) => {
                  const isUrl = label === "홈페이지" && value && value !== "-";
                  return (
                    <div key={label} className="grid grid-cols-[5.5rem_1fr] items-start gap-2 text-sm">
                      <span className={subtleText}>{label}</span>
                      {isUrl ? (
                        <a href={value} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
                          {value}
                        </a>
                      ) : (
                        <span className="break-words">{valueOrDash(value)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={`mt-4 text-xs ${subtleText}`}>
                각 기업이 공개한 정보와 수집 가능한 외부 데이터를 활용하여 제공합니다.
              </div>
            </div>

            {/* DART 재무 데이터 차트 */}
            {analysis?.multiYearFinancials?.length ? (
              <section className="space-y-3">
                <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>DART 재무 데이터</p>
                <FinancialChart data={analysis.multiYearFinancials} isDark={isDark} subtleText={subtleText} panelClass={panelClass} />
              </section>
            ) : null}

            {/* 최근 공시 */}
            {analysis?.disclosures?.length ? (
              <section className="space-y-2">
                <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>최근 공시</p>
                <div className="space-y-1.5">
                  {analysis.disclosures.slice(0, 5).map((d) => (
                    <a
                      key={d.url ?? d.title}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${panelClass} ${isDark ? "hover:bg-white/10" : "hover:bg-slate-50"}`}
                    >
                      <span className="font-medium">{d.title}</span>
                      <span className={`ml-3 shrink-0 text-xs ${subtleText}`}>{d.date}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-black">이 기업 최신 분석자료</h2>
                <button
                  onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                >
                  {company.hasAnalysis ? "핵심 분석 보기" : "기업 분석 시작"}
                </button>
              </div>

              {pointers.length ? (
                <div className="space-y-2 text-sm leading-relaxed">
                  {pointers.map((point, index) => (
                    <p key={`${point}-${index}`}>• {point}</p>
                  ))}
                </div>
              ) : (
                <div className={`rounded-md border p-4 ${mutedPanel}`}>
                  <p className={`text-sm ${subtleText}`}>아직 저장된 분석자료가 없습니다.</p>
                </div>
              )}

              {analysis?.summary ? (
                <div className="rounded-md bg-indigo-50 p-4 text-sm leading-relaxed text-slate-800 dark:bg-indigo-500/10 dark:text-indigo-100">
                  {analysis.summary}
                </div>
              ) : null}
            </section>
          </section>
        ) : activeTab === "jobs" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black">채용공고</h2>
                {jobsTotal > 0 ? (
                  <p className={`mt-0.5 text-xs ${subtleText}`}>{jobsTotal.toLocaleString()}건</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {jobSearchLoading ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500">
                    <span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                    검색 중{jobSearchCount > 0 ? ` · ${jobSearchCount}건` : "..."}
                  </div>
                ) : (
                  <button
                    onClick={handleJobSearch}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      isDark ? "border border-white/15 text-white/70 hover:bg-white/10" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    채용 공고 검색
                  </button>
                )}
                <button
                  onClick={() => router.push(`/recruit/job-posting?company=${encodeURIComponent(company.name)}`)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                    isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  전체 공고 보기
                </button>
              </div>
            </div>

            <div className={`rounded-md border p-4 ${panelClass}`}>
              {jobsLoading ? (
                <div className={`flex h-32 items-center justify-center text-sm ${subtleText}`}>채용공고를 불러오는 중...</div>
              ) : jobPostings.length === 0 ? (
                <div className={`flex h-32 items-center justify-center text-sm ${subtleText}`}>연결된 채용공고가 없습니다.</div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {jobPostings.map((posting) => (
                    <article key={posting.id} className={`rounded-md border p-3 ${mutedPanel}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                              {sourceLabel(posting.source)}
                            </span>
                            {posting.type ? <span className={`text-xs font-bold ${subtleText}`}>{posting.type}</span> : null}
                          </div>
                          <h3 className="mt-2 line-clamp-2 text-sm font-bold">{posting.title}</h3>
                          <p className={`mt-1 line-clamp-1 text-xs ${subtleText}`}>
                            {[posting.jobs, posting.location, posting.companyType].filter(Boolean).join(" · ") || "채용 정보"}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-bold ${isDark ? "bg-white/10 text-white/70" : "bg-white text-slate-600"}`}>
                          {postingDate(posting) || "상시"}
                        </span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => router.push(`/recruit/job-posting?job=${encodeURIComponent(posting.id)}`)}
                          className="rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                        >
                          공고 열기
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : activeTab === "news" ? (
          <section className="flex flex-col gap-4">

            {/* ── 실시간 수집 패널 ── */}
            <div className={`rounded-md border p-4 ${panelClass}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black">뉴스 수집</h2>
                </div>
                <button
                  onClick={handleFetchNews}
                  disabled={newsLoading}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                    newsLoading
                      ? "cursor-wait bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-white/30"
                      : isDark
                        ? "bg-white text-slate-950 hover:bg-white/90"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {newsLoading ? "수집 중..." : newsFetched ? "다시 수집" : "뉴스 수집"}
                </button>
              </div>

              {newsLoading ? (
                <p className={`mt-3 text-sm ${subtleText}`}>Puppeteer로 수집하는 중...</p>
              ) : newsFetched && news.length === 0 ? (
                <p className={`mt-3 text-sm ${subtleText}`}>검색 결과가 없습니다.</p>
              ) : newsFetched && news.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className={`text-xs font-semibold ${subtleText}`}>방금 수집된 결과 {news.length}건 (DB에 저장됨)</p>
                  {news.map((item, i) => (
                    <a
                      key={i}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded border p-3 transition-colors ${isDark ? "border-white/10 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"}`}
                    >
                      <p className="line-clamp-1 text-sm font-bold">{item.title}</p>
                      {item.snippet && (
                        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${subtleText}`}>{item.snippet}</p>
                      )}
                      <p className={`mt-1.5 line-clamp-1 text-xs ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                        {item.url}
                      </p>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {/* ── 저장된 뉴스 ── */}
            <div className={`rounded-md border p-4 ${panelClass}`}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black">저장된 뉴스</h2>
                  <p className={`mt-0.5 text-xs ${subtleText}`}>
                    {savedNewsLoaded ? `DB 저장 ${savedNews.length}건` : "로딩 중..."}
                  </p>
                </div>
                <button
                  onClick={() => { setSavedNewsLoaded(false); loadSavedNews(companyId); }}
                  className={`rounded px-2.5 py-1 text-xs font-bold transition-colors ${isDark ? "text-white/50 hover:text-white/80" : "text-slate-400 hover:text-slate-700"}`}
                >
                  새로고침
                </button>
              </div>

              {!savedNewsLoaded ? (
                <p className={`text-sm ${subtleText}`}>저장된 뉴스를 불러오는 중...</p>
              ) : savedNews.length === 0 ? (
                <p className={`text-sm ${subtleText}`}>저장된 뉴스가 없습니다. 수집 버튼으로 뉴스를 수집하면 자동으로 저장됩니다.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {savedNews.map((item) => (
                    <a
                      key={item.id ?? item.url}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded border p-3 transition-colors ${isDark ? "border-white/10 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"}`}
                    >
                      <p className="line-clamp-1 text-sm font-bold">{item.title}</p>
                      {item.snippet && (
                        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${subtleText}`}>{item.snippet}</p>
                      )}
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <p className={`line-clamp-1 text-xs ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                          {item.url}
                        </p>
                        {item.fetchedAt && (
                          <span className={`shrink-0 text-xs ${subtleText}`}>
                            {new Date(item.fetchedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

          </section>
        ) : activeTab === "stock" ? (
          <div className="flex flex-col gap-4">
            <StockChart
              companyId={companyId}
              isDark={isDark}
              panelClass={panelClass}
              mutedPanel={mutedPanel}
              subtleText={subtleText}
            />
            <InvestorTrading
              companyId={companyId}
              isDark={isDark}
              panelClass={panelClass}
              subtleText={subtleText}
            />
            {analysis?.multiYearFinancials?.length ? (
              <FinancialSection
                data={analysis.multiYearFinancials}
                isDark={isDark}
                panelClass={panelClass}
                subtleText={subtleText}
              />
            ) : null}
          </div>
        ) : activeTab === "analysis" ? (
          <section className="flex flex-col gap-5">
            {/* 헤더 */}
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 ${panelClass}`}>
              <div>
                <h2 className="text-base font-black">핵심 기업분석</h2>
                <p className={`mt-0.5 text-xs ${subtleText}`}>
                  {analysis?.updatedAt
                    ? `최종 분석: ${new Date(analysis.updatedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}`
                    : "저장된 분석이 없습니다."}
                </p>
              </div>
              <button
                onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
              >
                {company.hasAnalysis ? "분석 페이지에서 보기" : "분석 시작"}
              </button>
            </div>

            {!analysis ? (
              <div className={`rounded-md border p-8 text-center ${panelClass}`}>
                <p className={`text-sm font-bold ${subtleText}`}>아직 저장된 분석자료가 없습니다.</p>
                <button
                  onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
                  className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
                >
                  분석 시작
                </button>
              </div>
            ) : (
              <>
                {/* 한 줄 요약 + 신용등급 */}
                {(analysis.summary || analysis.creditRating) ? (
                  <div className={`rounded-md border p-4 ${panelClass}`}>
                    {analysis.summary ? (
                      <p className="text-sm leading-relaxed">{analysis.summary}</p>
                    ) : null}
                    {analysis.creditRating ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`text-xs font-bold ${subtleText}`}>신용등급</span>
                        <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                          {analysis.creditRating}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* SWOT */}
                {analysis.swot ? (
                  <div>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${subtleText}`}>SWOT 분석</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: "S", label: "강점 Strengths", color: isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50", badge: "text-emerald-700 dark:text-emerald-300" },
                          { key: "W", label: "약점 Weaknesses", color: isDark ? "border-red-500/30 bg-red-500/10" : "border-red-200 bg-red-50", badge: "text-red-700 dark:text-red-300" },
                          { key: "O", label: "기회 Opportunities", color: isDark ? "border-blue-500/30 bg-blue-500/10" : "border-blue-200 bg-blue-50", badge: "text-blue-700 dark:text-blue-300" },
                          { key: "T", label: "위협 Threats", color: isDark ? "border-orange-500/30 bg-orange-500/10" : "border-orange-200 bg-orange-50", badge: "text-orange-700 dark:text-orange-300" },
                        ] as const
                      ).map(({ key, label, color, badge }) => (
                        <div key={key} className={`rounded-md border p-3 ${color}`}>
                          <p className={`mb-2 text-xs font-black ${badge}`}>{label}</p>
                          <ul className="space-y-1.5">
                            {(analysis.swot?.[key] ?? []).map((item, i) => (
                              <li key={i} className="text-xs leading-relaxed">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 사업부문 */}
                {analysis.businessSegments?.length ? (
                  <div>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${subtleText}`}>사업부문</p>
                    <div className="space-y-2">
                      {analysis.businessSegments.map((seg, i) => (
                        <div key={i} className={`rounded-md border p-3 ${panelClass}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black">{seg.name}</span>
                            {seg.revenueShare ? (
                              <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                                {seg.revenueShare}
                              </span>
                            ) : null}
                          </div>
                          {seg.description ? (
                            <p className={`mt-1.5 text-xs leading-relaxed ${subtleText}`}>{seg.description}</p>
                          ) : null}
                          {seg.mainProducts ? (
                            <p className={`mt-1 text-xs ${subtleText}`}>주요 제품: {seg.mainProducts}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 경쟁사 */}
                {analysis.competitors?.length ? (
                  <div>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${subtleText}`}>경쟁사</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {analysis.competitors.map((comp, i) => {
                        const threatColors: Record<string, string> = {
                          high: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200",
                          medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
                          low: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60",
                        };
                        const threatLabel: Record<string, string> = { high: "높음", medium: "중간", low: "낮음" };
                        return (
                          <div key={i} className={`rounded-md border p-3 ${mutedPanel}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {comp.siteUrl ? (
                                  <a href={comp.siteUrl} target="_blank" rel="noreferrer" className="text-sm font-black underline underline-offset-2">
                                    {comp.name}
                                  </a>
                                ) : (
                                  <span className="text-sm font-black">{comp.name}</span>
                                )}
                              </div>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${threatColors[comp.threatLevel] ?? threatColors.low}`}>
                                위협 {threatLabel[comp.threatLevel] ?? comp.threatLevel}
                              </span>
                            </div>
                            {comp.reason ? (
                              <p className={`mt-1.5 text-xs leading-relaxed ${subtleText}`}>{comp.reason}</p>
                            ) : null}
                            {comp.needed ? (
                              <p className={`mt-1 text-xs font-semibold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>대응: {comp.needed}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* 미션 / 비전 */}
                {analysis.missionVision ? (
                  <div className={`rounded-md border p-4 ${panelClass}`}>
                    <p className={`mb-3 text-xs font-bold uppercase tracking-widest ${subtleText}`}>미션 · 비전</p>
                    <div className="space-y-2 text-sm">
                      {analysis.missionVision.mission ? (
                        <div className="flex gap-2">
                          <span className={`shrink-0 font-bold ${subtleText}`}>미션</span>
                          <span className="leading-relaxed">{analysis.missionVision.mission}</span>
                        </div>
                      ) : null}
                      {analysis.missionVision.vision ? (
                        <div className="flex gap-2">
                          <span className={`shrink-0 font-bold ${subtleText}`}>비전</span>
                          <span className="leading-relaxed">{analysis.missionVision.vision}</span>
                        </div>
                      ) : null}
                      {analysis.missionVision.coreValues?.length ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {analysis.missionVision.coreValues.map((v) => (
                            <span key={v} className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {analysis.missionVision.talentProfile ? (
                        <p className={`pt-1 text-xs leading-relaxed ${subtleText}`}>인재상: {analysis.missionVision.talentProfile}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* 역량 점수 */}
                {analysis.scores ? (
                  <div>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${subtleText}`}>역량 점수</p>
                    <div className={`rounded-md border p-4 ${panelClass}`}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(analysis.scores).map(([key, score]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className={`w-20 shrink-0 text-xs ${subtleText}`}>{key}</span>
                            <div className={`h-1.5 flex-1 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                              <div
                                className="h-1.5 rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(100, (score / 10) * 100)}%` }}
                              />
                            </div>
                            <span className="w-6 shrink-0 text-right text-xs font-bold">{score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* AI 분석 리포트 */}
                {analysis.report ? (
                  <div>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${subtleText}`}>AI 분석 리포트</p>
                    <div className={`rounded-md border p-4 text-sm leading-relaxed whitespace-pre-wrap ${panelClass}`}>
                      {analysis.report}
                    </div>
                  </div>
                ) : null}

                {/* 최근 뉴스 */}
                {analysis.recentNews?.length ? (
                  <div>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${subtleText}`}>최근 뉴스</p>
                    <div className="space-y-1.5">
                      {analysis.recentNews.slice(0, 6).map((news, i) => (
                        <a
                          key={i}
                          href={news.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${panelClass} ${isDark ? "hover:bg-white/10" : "hover:bg-slate-50"}`}
                        >
                          <span className="line-clamp-1 font-medium">{news.title}</span>
                          <span className={`ml-3 shrink-0 text-xs ${subtleText}`}>{news.date}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : (
          <section className={`rounded-md border p-6 text-center ${panelClass}`}>
            <h2 className="text-base font-black">{TABS.find((tab) => tab.key === activeTab)?.label}</h2>
            <p className={`mt-2 text-sm ${subtleText}`}>이 영역은 기업 상세 페이지 구조에 맞춰 이어서 확장할 수 있습니다.</p>
          </section>
        )}
      </div>
    </main>
  );
}
