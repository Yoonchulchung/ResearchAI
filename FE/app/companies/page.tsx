"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  listCompanies,
  getMissingStats,
  refreshAllMissingCompanies,
  stopMissingRefresh,
  getCompanyCollectEnabled,
  setCompanyCollectEnabled,
  type CompanyListItem,
  type CompanyMissingStats,
} from "@/lib/api/companies";
import { EnrichQueueWidget } from "./_components/EnrichQueueWidget";

function formatDate(value: string | null) {
  if (!value) return "분석 없음";
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function metadata(company: CompanyListItem) {
  return [company.industry, company.companyType, company.employees ? `${company.employees}` : null]
    .filter(Boolean)
    .join(" · ") || "기업 정보";
}

function CompaniesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [onlyAnalyzed, setOnlyAnalyzed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingStats, setMissingStats] = useState<CompanyMissingStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTotal, setRefreshTotal] = useState<number | null>(null);
  const [refreshStopping, setRefreshStopping] = useState(false);
  const [collectEnabled, setCollectEnabled] = useState(true);
  const [collectToggling, setCollectToggling] = useState(false);

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

  const loadCompanies = async (q = query) => {
    setLoading(true);
    setError("");
    try {
      const items = await listCompanies({
        q,
        hasAnalysis: onlyAnalyzed ? true : undefined,
        limit: 500,
      });
      setCompanies(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "기업 목록을 불러오지 못했습니다.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyAnalyzed]);

  useEffect(() => {
    getMissingStats().then(setMissingStats).catch(() => {});
    getCompanyCollectEnabled().then(setCollectEnabled).catch(() => {});
  }, []);

  const handleRefreshAllMissing = async () => {
    setRefreshing(true);
    setRefreshTotal(null);
    try {
      const result = await refreshAllMissingCompanies();
      setRefreshTotal(result.total);
      setTimeout(() => getMissingStats().then(setMissingStats).catch(() => {}), 1000);
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  };

  const handleStopRefresh = async () => {
    setRefreshStopping(true);
    try { await stopMissingRefresh(); } catch { /* ignore */ } finally {
      setRefreshStopping(false);
    }
  };

  const handleToggleCollect = async () => {
    setCollectToggling(true);
    try {
      await setCompanyCollectEnabled(!collectEnabled);
      setCollectEnabled((prev) => !prev);
    } catch { /* ignore */ } finally {
      setCollectToggling(false);
    }
  };

  const analyzedCount = useMemo(() => companies.filter((company) => company.hasAnalysis).length, [companies]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadCompanies(query.trim());
  };

  const openAnalysis = (company: CompanyListItem) => {
    router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`);
  };

  const openCompany = (company: CompanyListItem) => {
    router.push(`/companies/${encodeURIComponent(company.id)}`);
  };

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className={`rounded-2xl border p-5 shadow-sm ${panelClass}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={`text-sm font-semibold ${subtleText}`}>Companies</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">기업</h1>
              <p className={`mt-2 text-sm ${subtleText}`}>
                수집된 기업을 먼저 조회하고, 필요한 기업의 분석 결과를 열거나 새 분석을 시작합니다.
              </p>
            </div>
            <button
              onClick={() => router.push("/companies/analysis")}
              className={`w-fit rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
              }`}
            >
              분석 페이지
            </button>
          </div>

          <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-4 py-3 ${
              isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
            }`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={subtleText}>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="기업명 검색"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOnlyAnalyzed((value) => !value)}
                className={`rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
                  onlyAnalyzed
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : isDark ? "border-white/10 text-white/70 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                분석 있음
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
              >
                검색
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-4 lg:grid-cols-[15rem_1fr]">
          <aside className={`flex flex-col gap-4 rounded-2xl border p-5 shadow-sm ${panelClass}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>Summary</p>
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-3xl font-black">{companies.length.toLocaleString()}</p>
                  <p className={`text-sm ${subtleText}`}>조회 기업</p>
                </div>
                <div>
                  <p className="text-3xl font-black">{analyzedCount.toLocaleString()}</p>
                  <p className={`text-sm ${subtleText}`}>분석 보유</p>
                </div>
              </div>
            </div>

            {/* 결측치 현황 */}
            <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>결측치</p>
              <div className="mt-3 space-y-2">
                {missingStats ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className={subtleText}>기업 유형 없음</span>
                      <span className={`font-bold ${missingStats.missingCompanyType > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                        {missingStats.missingCompanyType.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={subtleText}>직원 수 없음</span>
                      <span className={`font-bold ${missingStats.missingEmployees > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                        {missingStats.missingEmployees.toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className={`text-xs ${subtleText}`}>불러오는 중...</p>
                )}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={handleRefreshAllMissing}
                  disabled={refreshing || missingStats?.missingCompanyType === 0}
                  className={`w-full rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                    isDark ? "bg-indigo-500 text-white hover:bg-indigo-400" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {refreshing ? "시작 중..." : "결측치 재수집 시작"}
                </button>
                <button
                  onClick={handleStopRefresh}
                  disabled={refreshStopping}
                  className={`w-full rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                    isDark ? "bg-white/10 text-white/60 hover:bg-white/15" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {refreshStopping ? "중지 중..." : "재수집 중지"}
                </button>
                {refreshTotal !== null && (
                  <p className={`text-center text-xs ${subtleText}`}>
                    {refreshTotal.toLocaleString()}개 기업 수집 시작됨
                  </p>
                )}
              </div>
            </div>

            {/* 공고 수집 큐 on/off */}
            <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>수집 큐</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{collectEnabled ? "수집 활성" : "수집 중지"}</p>
                  <p className={`text-xs mt-0.5 ${subtleText}`}>
                    {collectEnabled ? "기업 정보를 자동으로 수집합니다" : "수집이 일시 중지됩니다"}
                  </p>
                </div>
                <button
                  onClick={handleToggleCollect}
                  disabled={collectToggling}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    collectEnabled ? "bg-indigo-600" : isDark ? "bg-white/20" : "bg-slate-300"
                  }`}
                  role="switch"
                  aria-checked={collectEnabled}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    collectEnabled ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>
            </div>

            <EnrichQueueWidget />
          </aside>

          <div className={`min-h-112 rounded-2xl border p-4 shadow-sm ${panelClass}`}>
            {loading ? (
              <div className={`flex h-64 items-center justify-center text-sm ${subtleText}`}>기업 목록을 불러오는 중...</div>
            ) : error ? (
              <div className="flex h-64 items-center justify-center text-sm text-red-500">{error}</div>
            ) : companies.length === 0 ? (
              <div className={`flex h-64 flex-col items-center justify-center gap-3 text-sm ${subtleText}`}>
                <p>조회된 기업이 없습니다.</p>
                <button
                  onClick={() => router.push(query.trim() ? `/companies/analysis?company=${encodeURIComponent(query.trim())}` : "/companies/analysis")}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white"
                >
                  새 기업 분석
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {companies.map((company) => (
                  <article
                    key={company.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCompany(company)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openCompany(company);
                      }
                    }}
                    className={`flex min-h-48 cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
                      isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black">{company.name}</h2>
                        <p className={`mt-1 truncate text-sm ${subtleText}`}>{metadata(company)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                        company.hasAnalysis
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                          : isDark ? "bg-white/10 text-white/45" : "bg-slate-100 text-slate-500"
                      }`}>
                        {company.hasAnalysis ? "분석 있음" : "미분석"}
                      </span>
                    </div>

                    <p className={`mt-4 line-clamp-3 text-sm leading-relaxed ${subtleText}`}>
                      {company.analysisSummary || company.address || company.homeUrl || "아직 상세 설명이 없습니다."}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-5">
                      <span className={`text-xs font-semibold ${subtleText}`}>
                        {company.hasAnalysis ? `분석 ${formatDate(company.analysisUpdatedAt)}` : `수집 ${formatDate(company.updatedAt)}`}
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openAnalysis(company);
                        }}
                        className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                          company.hasAnalysis
                            ? "bg-indigo-600 text-white hover:bg-indigo-700"
                            : isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        {company.hasAnalysis ? "분석 보기" : "분석 시작"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense>
      <CompaniesContent />
    </Suspense>
  );
}
