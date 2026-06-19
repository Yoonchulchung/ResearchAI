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

function getRepresentativeCategory(industry: string | null | undefined): string {
  if (!industry) return "기타";
  const ind = industry.toLowerCase().replace(/\s/g, "");
  
  if (
    ind.includes("소프트웨어") ||
    ind.includes("컴퓨터") ||
    ind.includes("정보") ||
    ind.includes("통신") ||
    ind.includes("포털") ||
    ind.includes("it") ||
    ind.includes("프로그래밍") ||
    ind.includes("네트워크") ||
    ind.includes("게임") ||
    ind.includes("인터넷") ||
    ind.includes("플랫폼")
  ) {
    return "IT / 정보통신";
  }
  
  if (
    ind.includes("제조") ||
    ind.includes("화학") ||
    ind.includes("철강") ||
    ind.includes("조선") ||
    ind.includes("반도체") ||
    ind.includes("자동차") ||
    ind.includes("부품") ||
    ind.includes("기계") ||
    ind.includes("금속") ||
    ind.includes("장비") ||
    ind.includes("전자제품") ||
    ind.includes("전기") ||
    ind.includes("의류") ||
    ind.includes("식품") ||
    ind.includes("제과") ||
    ind.includes("화장품") ||
    ind.includes("패션")
  ) {
    return "제조 / 생산";
  }
  
  if (
    ind.includes("금융") ||
    ind.includes("은행") ||
    ind.includes("증권") ||
    ind.includes("보험") ||
    ind.includes("투자") ||
    ind.includes("자산") ||
    ind.includes("카드") ||
    ind.includes("캐피탈")
  ) {
    return "금융 / 보험";
  }
  
  if (
    ind.includes("바이오") ||
    ind.includes("제약") ||
    ind.includes("의약") ||
    ind.includes("의료") ||
    ind.includes("헬스케어") ||
    ind.includes("병원") ||
    ind.includes("생명공학")
  ) {
    return "바이오 / 제약";
  }
  
  if (
    ind.includes("유통") ||
    ind.includes("물류") ||
    ind.includes("무역") ||
    ind.includes("도매") ||
    ind.includes("소매") ||
    ind.includes("판매") ||
    ind.includes("상사") ||
    ind.includes("커머스") ||
    ind.includes("쇼핑") ||
    ind.includes("백화점") ||
    ind.includes("마트") ||
    ind.includes("편의점")
  ) {
    return "유통 / 물류 / 무역";
  }
  
  if (
    ind.includes("건설") ||
    ind.includes("부동산") ||
    ind.includes("토목") ||
    ind.includes("건축") ||
    ind.includes("시공") ||
    ind.includes("개발") && (ind.includes("시행") || ind.includes("공급"))
  ) {
    return "건설 / 부동산";
  }
  
  if (
    ind.includes("엔터") ||
    ind.includes("미디어") ||
    ind.includes("콘텐츠") ||
    ind.includes("영화") ||
    ind.includes("방송") ||
    ind.includes("출판") ||
    ind.includes("인쇄") ||
    ind.includes("문화") ||
    ind.includes("예술") ||
    ind.includes("여행") ||
    ind.includes("관광") ||
    ind.includes("레저") ||
    ind.includes("호텔")
  ) {
    return "미디어 / 엔터 / 관광";
  }
  
  if (
    ind.includes("교육") ||
    ind.includes("학원") ||
    ind.includes("학교") ||
    ind.includes("대학")
  ) {
    return "교육 / 학술";
  }
  
  if (
    ind.includes("에너지") ||
    ind.includes("환경") ||
    ind.includes("발전") ||
    ind.includes("가스") ||
    ind.includes("전력") ||
    ind.includes("자원") ||
    ind.includes("정유") ||
    ind.includes("유전")
  ) {
    return "에너지 / 환경";
  }
  
  if (
    ind.includes("경영") ||
    ind.includes("컨설팅") ||
    ind.includes("광고") ||
    ind.includes("디자인") ||
    ind.includes("법률") ||
    ind.includes("회계") ||
    ind.includes("세무") ||
    ind.includes("번역") ||
    ind.includes("서비스") ||
    ind.includes("인력") ||
    ind.includes("헤드헌팅") ||
    ind.includes("시설") ||
    ind.includes("연구") ||
    ind.includes("공공") ||
    ind.includes("단체")
  ) {
    return "경영 / 서비스";
  }

  return "기타";
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

  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [unfilteredCompanies, setUnfilteredCompanies] = useState<CompanyListItem[]>([]);

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const c of unfilteredCompanies) {
      const category = getRepresentativeCategory(c.industry);
      set.add(category);
    }
    const list = Array.from(set).sort();
    // '기타'를 맨 뒤로 이동
    const otherIndex = list.indexOf("기타");
    if (otherIndex > -1) {
      list.splice(otherIndex, 1);
      list.push("기타");
    }
    return list;
  }, [unfilteredCompanies]);

  const filteredAnalyzedCount = useMemo(() => {
    return companies.filter((company) => company.hasAnalysis).length;
  }, [companies]);

  const unfilteredAnalyzedCount = useMemo(() => {
    return unfilteredCompanies.filter((company) => company.hasAnalysis).length;
  }, [unfilteredCompanies]);

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

  const loadCompanies = async (q = query, inds = selectedIndustries) => {
    setLoading(true);
    setError("");
    try {
      const items = await listCompanies({
        q,
        hasAnalysis: onlyAnalyzed ? true : undefined,
        limit: 500,
        industry: inds.length > 0 ? inds.join(",") : undefined,
      });
      setCompanies(items);
      if (inds.length === 0) {
        setUnfilteredCompanies(items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "기업 목록을 불러오지 못했습니다.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies(query, selectedIndustries);
  }, [onlyAnalyzed, selectedIndustries]);

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

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIndustries.length > 0) {
      setSelectedIndustries([]);
    } else {
      loadCompanies(query.trim(), []);
    }
  };

  const openAnalysis = (company: CompanyListItem) => {
    router.push(`/companies/analysis?company=${encodeURIComponent(company.name)}`);
  };

  const openCompany = (company: CompanyListItem) => {
    router.push(`/companies/${encodeURIComponent(company.id)}`);
  };

  return (
    <main className={`h-full lg:overflow-hidden flex flex-col ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 min-h-full lg:h-full lg:flex-1 lg:min-h-0">
        <section className={`rounded-md border p-5 shrink-0 ${panelClass}`}>
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
              className={`w-fit rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
              }`}
            >
              분석 페이지
            </button>
          </div>

          <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-4 py-3 ${
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
                className={`rounded-md border px-4 py-3 text-sm font-bold transition-colors ${
                  onlyAnalyzed
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : isDark ? "border-white/10 text-white/70 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                분석 있음
              </button>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
              >
                검색
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-slate-200/60 dark:border-white/10 pt-4">
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${subtleText}`}>직종 분류</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedIndustries([])}
                className={`flex items-center gap-2 shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold border transition-all duration-200 ${
                  selectedIndustries.length === 0
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                    : isDark
                      ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>전체 직종</span>
              </button>

              {industries.map((ind) => {
                const active = selectedIndustries.includes(ind);
                return (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => {
                      setSelectedIndustries((prev) =>
                        prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind]
                      );
                    }}
                    className={`flex items-center gap-2 shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold border transition-all duration-200 ${
                      active
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                        : isDark
                          ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span>{ind}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[15rem_1fr] lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          <aside className={`flex flex-col gap-4 rounded-md border p-5 lg:overflow-y-auto lg:h-full shrink-0 ${panelClass}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>Summary</p>
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-3xl font-black">
                    {selectedIndustries.length > 0 
                      ? `${companies.length.toLocaleString()} / ${unfilteredCompanies.length.toLocaleString()}`
                      : companies.length.toLocaleString()}
                  </p>
                  <p className={`text-sm ${subtleText}`}>조회 기업</p>
                </div>
                <div>
                  <p className="text-3xl font-black">
                    {selectedIndustries.length > 0
                      ? `${filteredAnalyzedCount.toLocaleString()} / ${unfilteredAnalyzedCount.toLocaleString()}`
                      : filteredAnalyzedCount.toLocaleString()}
                  </p>
                  <p className={`text-sm ${subtleText}`}>분석 보유</p>
                </div>
              </div>
            </div>

            {/* 결측치 현황 */}
            <div className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
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
                  className={`w-full rounded-md px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                    isDark ? "bg-indigo-500 text-white hover:bg-indigo-400" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {refreshing ? "시작 중..." : "결측치 재수집 시작"}
                </button>
                <button
                  onClick={handleStopRefresh}
                  disabled={refreshStopping}
                  className={`w-full rounded-md px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
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
            <div className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
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
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-sm transition-colors disabled:opacity-50 ${
                    collectEnabled ? "bg-indigo-600" : isDark ? "bg-white/20" : "bg-slate-300"
                  }`}
                  role="switch"
                  aria-checked={collectEnabled}
                >
                  <span className={`inline-block h-4 w-4 rounded-sm bg-white shadow transition-transform ${
                    collectEnabled ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>
            </div>

            <EnrichQueueWidget />
          </aside>

          <div className={`min-h-112 rounded-md border p-4 lg:overflow-y-auto lg:h-full ${panelClass}`}>
            {loading ? (
              <div className={`flex h-64 items-center justify-center text-sm ${subtleText}`}>기업 목록을 불러오는 중...</div>
            ) : error ? (
              <div className="flex h-64 items-center justify-center text-sm text-red-500">{error}</div>
            ) : companies.length === 0 ? (
              <div className={`flex h-64 flex-col items-center justify-center gap-3 text-sm ${subtleText}`}>
                <p>해당 직종의 기업이 없습니다.</p>
                {unfilteredCompanies.length > 0 ? (
                  <button
                    onClick={() => setSelectedIndustries([])}
                    className="rounded-md bg-indigo-600 px-4 py-2 font-bold text-white text-xs"
                  >
                    필터 초기화
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(query.trim() ? `/companies/analysis?company=${encodeURIComponent(query.trim())}` : "/companies/analysis")}
                    className="rounded-md bg-indigo-600 px-4 py-2 font-bold text-white"
                  >
                    새 기업 분석
                  </button>
                )}
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
                    className={`flex min-h-48 cursor-pointer flex-col rounded-md border p-4 transition-colors ${
                      isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black">{company.name}</h2>
                        <p className={`mt-1 truncate text-sm ${subtleText}`}>{metadata(company)}</p>
                      </div>
                      <span className={`shrink-0 rounded-sm px-2.5 py-1 text-xs font-bold ${
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
                        className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${
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
