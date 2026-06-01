"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { getCompanyAnalysis, type CompanyAnalysis } from "@/lib/api/company-analysis";
import { getCompany, refreshCompanyMissing, type CompanyListItem } from "@/lib/api/companies";
import { listJobPostings, type JobPosting } from "@/lib/api/recruit/job-posting";
import { recruitSearch } from "@/lib/recruit-search";

type TabKey = "overview" | "jobs" | "analysis";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "jobs", label: "채용공고" },
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

function infoRows(company: CompanyListItem, analysis: CompanyAnalysis | null): [string, string | null | undefined][] {
  return [
    ["산업(업종)", analysis?.industry ?? company.industry],
    ["기업 형태", analysis?.companySize ?? company.companyType],
    ["대표자", analysis?.ceoName ?? company.ceoName],
    ["사원수", formatEmployees(analysis?.employees ?? company.employees)],
    ["매출액", company.revenue ?? analysis?.financialSummary],
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
          <div className={`rounded-xl border px-5 py-4 text-sm ${panelClass} ${subtleText}`}>기업 정보를 불러오는 중...</div>
        </div>
      </main>
    );
  }

  if (!company) {
    return (
      <main className={`h-full overflow-y-auto ${pageClass}`}>
        <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center px-4 py-8">
          <div className={`rounded-xl border p-6 text-center ${panelClass}`}>
            <h1 className="text-lg font-black">기업을 찾을 수 없습니다.</h1>
            <p className={`mt-1.5 text-sm ${subtleText}`}>{error || "목록에서 다시 선택해 주세요."}</p>
            <button onClick={() => router.push("/companies")} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">
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
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border text-2xl font-black ${mutedPanel}`}>
            {firstChar(company.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{company.name}</h1>
              <span className={`text-base font-light ${subtleText}`}>| 기업정보</span>
              <button
                className={`rounded-full p-1.5 transition-colors ${isDark ? "text-white/35 hover:bg-white/10 hover:text-white" : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"}`}
                aria-label="관심 기업"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 21s-6.7-4.35-9.35-8.1C.75 10.21 1.4 6.6 4.18 5.1 6.1 4.06 8.44 4.45 10 6.02 11.56 4.45 13.9 4.06 15.82 5.1c2.78 1.5 3.43 5.11 1.53 7.8C14.7 16.65 12 21 12 21Z" />
                </svg>
              </button>
              {homeUrl ? (
                <a
                  href={homeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-full p-1.5 transition-colors ${isDark ? "text-white/45 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
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
            className={`w-fit rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              refreshing
                ? "cursor-wait bg-slate-300 text-slate-600"
                : isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            {refreshing ? "재수집 중..." : "결측치 크롤링"}
          </button>
        </section>

        {/* 탭 */}
        <nav className="grid grid-cols-3 border-b border-slate-200 text-center dark:border-white/10">
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
              {activeTab === tab.key ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-orange-500" /> : null}
            </button>
          ))}
        </nav>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
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
              {tags.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={`rounded-xl border p-4 ${panelClass}`}>
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

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-black">이 기업 최신 분석자료</h2>
                <button
                  onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
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
                <div className={`rounded-xl border p-4 ${mutedPanel}`}>
                  <p className={`text-sm ${subtleText}`}>아직 저장된 분석자료가 없습니다.</p>
                </div>
              )}

              {analysis?.summary ? (
                <div className="rounded-xl bg-indigo-50 p-4 text-sm leading-relaxed text-slate-800 dark:bg-indigo-500/10 dark:text-indigo-100">
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
                <p className={`mt-0.5 text-xs ${subtleText}`}>
                  `recruit_job_posting`에 저장된 {company.name} 공고 {jobsTotal.toLocaleString()}건
                </p>
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
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      isDark ? "border border-white/15 text-white/70 hover:bg-white/10" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    채용 공고 검색
                  </button>
                )}
                <button
                  onClick={() => router.push(`/recruit/job-posting?company=${encodeURIComponent(company.name)}`)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  전체 공고 보기
                </button>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${panelClass}`}>
              {jobsLoading ? (
                <div className={`flex h-32 items-center justify-center text-sm ${subtleText}`}>채용공고를 불러오는 중...</div>
              ) : jobPostings.length === 0 ? (
                <div className={`flex h-32 items-center justify-center text-sm ${subtleText}`}>연결된 채용공고가 없습니다.</div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {jobPostings.map((posting) => (
                    <article key={posting.id} className={`rounded-lg border p-3 ${mutedPanel}`}>
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
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${isDark ? "bg-white/10 text-white/70" : "bg-white text-slate-600"}`}>
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
        ) : activeTab === "analysis" ? (
          <section className={`rounded-xl border p-5 ${panelClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black">핵심 기업분석</h2>
                <p className={`mt-1 text-xs ${subtleText}`}>
                  저장된 분석이 있으면 분석 페이지에서 세부 내용을 확인할 수 있습니다.
                </p>
              </div>
              <button
                onClick={() => router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
              >
                {company.hasAnalysis ? "분석 보기" : "분석 시작"}
              </button>
            </div>
            {pointers.length ? (
              <div className="mt-4 space-y-2 text-sm leading-relaxed">
                {pointers.map((point, index) => <p key={`${point}-${index}`}>• {point}</p>)}
              </div>
            ) : (
              <p className={`mt-4 text-sm ${subtleText}`}>아직 저장된 분석자료가 없습니다.</p>
            )}
          </section>
        ) : (
          <section className={`rounded-xl border p-6 text-center ${panelClass}`}>
            <h2 className="text-base font-black">{TABS.find((tab) => tab.key === activeTab)?.label}</h2>
            <p className={`mt-2 text-sm ${subtleText}`}>이 영역은 기업 상세 페이지 구조에 맞춰 이어서 확장할 수 있습니다.</p>
          </section>
        )}
      </div>
    </main>
  );
}
