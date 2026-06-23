"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useCoverLetterList } from "./_hooks/useCoverLetterList";
import { useCoverLetterScraping } from "./_hooks/useCoverLetterScraping";
import CompanyAnalysisPanel from "@/recruit/resume/components/CompanyAnalysisPanel";
import { ScrapeGaugeBar } from "@/recruit/_components/ScrapeGaugeBar";

const SOURCE_FILTERS = [
  { value: "", label: "전체" },
  { value: "catch", label: "캐치" },
  { value: "linkareer", label: "링커리어" },
] as const;
const COMPANY_TYPE_FILTERS = ["", "대기업", "중견기업", "중소기업", "금융권"] as const;
const JOB_CATEGORY_FILTERS = [
  { value: "all", label: "전체" },
  { value: "IT+전자", label: "IT+전자" },
  { value: "IT", label: "IT" },
  { value: "전자", label: "전자" },
  { value: "경영/기획", label: "경영/기획" },
  { value: "영업", label: "영업" },
  { value: "마케팅", label: "마케팅" },
  { value: "인사/총무", label: "인사/총무" },
  { value: "재무/회계", label: "재무/회계" },
  { value: "생산/제조", label: "생산/제조" },
  { value: "기타", label: "기타" },
] as const;

function CoverLetterPageContent() {
  const searchParams = useSearchParams();
  const coverId = searchParams.get("cover");
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const list = useCoverLetterList(coverId);
  const scraping = useCoverLetterScraping(list.reload);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [hideLoading, setHideLoading] = useState(false);

  const handleSelectedHiddenToggle = async () => {
    if (!list.selected || hideLoading) return;
    setHideLoading(true);
    try {
      await list.handleToggleHidden(list.selected.id, !list.selected.isHidden);
    } finally {
      setHideLoading(false);
    }
  };

  useEffect(() => {
    // 부모 main 엘리먼트의 스크롤을 막아서 중첩 스크롤 및 뷰포트 밀림 방지
    const mainEl = document.querySelector("main");
    if (mainEl) {
      const originalOverflow = mainEl.style.overflow;
      mainEl.style.overflow = "hidden";
      return () => {
        mainEl.style.overflow = originalOverflow;
      };
    }
  }, []);

  return (
    <div className={`h-full flex flex-col overflow-hidden ${isGlass ? "p-3 pr-4 pb-4 bg-transparent" : "bg-slate-100"}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-md border border-white/20" : ""}`}>

        {/* Topbar */}
        <div className={`shrink-0 flex flex-col border-b transition-all duration-200 ease-out overflow-hidden ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : "bg-white border-slate-200/60"} ${
          list.isHeaderHidden
            ? "max-lg:max-h-0 max-lg:opacity-0 max-lg:-translate-y-2 max-lg:pointer-events-none max-lg:border-b-0"
            : "max-lg:max-h-28 max-lg:opacity-100 max-lg:translate-y-0"
        }`}>
          <div className="flex items-center gap-2 px-4 sm:px-5 pt-2.5 pb-1.5">
            <button
              onClick={list.handleBack}
              className={`shrink-0 flex items-center gap-1 text-sm transition-colors ${isDark ? "text-white/50 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>합격 자소서</span>
            <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{list.total.toLocaleString()}건</span>
            <div className="flex-1" />
            <button
              onClick={() => window.location.assign("/recruit/spec")}
              className={`hidden sm:inline-flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isDark ? "text-indigo-300 hover:bg-white/10" : "text-indigo-600 hover:bg-indigo-50"
              }`}
            >
              스펙 분석
            </button>
            <button
              onClick={() => setShowAnalysis((v) => !v)}
              title="기업 분석 패널"
              className={`hidden xl:inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                showAnalysis
                  ? isDark ? "bg-violet-500/20 text-violet-300" : "bg-violet-50 text-violet-700"
                  : isDark ? "text-white/40 hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              기업분석
            </button>
            <div className={`hidden sm:flex shrink-0 items-center gap-1 rounded-md p-0.5 border ${
              isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
            }`}>
              {(["all", "catch", "linkareer"] as const).map((source) => (
                <button
                  key={source}
                  onClick={() => scraping.setScrapeSource(source)}
                  disabled={scraping.status?.running || scraping.scrapeLoading}
                  className={`px-2 py-1 text-xs font-semibold rounded-md transition-all disabled:opacity-50 ${
                    scraping.scrapeSource === source
                      ? isDark ? "bg-white/20 text-white" : "bg-white text-slate-800"
                      : isDark ? "text-white/45 hover:text-white/80" : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  {source === "all" ? "전체" : source === "catch" ? "캐치" : "링커리어"}
                </button>
              ))}
            </div>
            {scraping.status?.running ? (
              <button
                onClick={scraping.handleStop}
                disabled={scraping.scrapeLoading}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-all disabled:opacity-50 bg-red-500 text-white border-red-500 hover:bg-red-600"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor"/>
                </svg>
                중단
              </button>
            ) : (
              <button
                onClick={scraping.handleStart}
                disabled={scraping.scrapeLoading}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-all disabled:opacity-50 bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
              >
                {scraping.scrapeLoading ? (
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
                    <path d="M2 1.5L9.5 5.5L2 9.5V1.5Z" fill="currentColor"/>
                  </svg>
                )}
                크롤링 시작
              </button>
            )}
          </div>
          {(scraping.status?.running) && (
            <div className="px-4 sm:px-5 pb-2.5">
              <ScrapeGaugeBar
                running={!!scraping.status?.running}
                label={`수집 중 · p.${scraping.status.currentPage}`}
                current={scraping.status.totalCollected}
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: list */}
          <div className={`${list.selected ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-90 shrink-0 border-r overflow-hidden ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-200"}`}>
            {/* Filters */}
            <div className={`shrink-0 px-3 py-2.5 border-b ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-100"}`}>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <input
                  value={list.search}
                  onChange={(e) => list.setSearch(e.target.value)}
                  placeholder="기업명, 직무, 시즌 검색"
                  className={`w-full pl-7 pr-3 py-1.5 text-sm rounded-md border focus:outline-none transition-colors ${
                    isGlass && isDark
                      ? "bg-white/10 border-white/20 text-white placeholder-white/40 focus:border-white/40"
                      : "bg-slate-50 border-slate-200 text-slate-700 placeholder-slate-400 focus:bg-white focus:border-indigo-300"
                  }`}
                />
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <div className={`grid grid-cols-3 gap-1 rounded-md p-0.5 border ${
                  isGlass && isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
                }`}>
                  {SOURCE_FILTERS.map((item) => (
                    <button
                      key={item.value || "all"}
                      onClick={() => list.setSourceFilter(item.value)}
                      className={`h-7 rounded-md text-xs font-semibold transition-all ${
                        list.sourceFilter === item.value
                          ? isGlass && isDark ? "bg-white/20 text-white" : "bg-white text-slate-800"
                          : isGlass && isDark ? "text-white/45 hover:text-white/80" : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className={`grid grid-cols-2 gap-1 rounded-md p-0.5 border ${
                  isGlass && isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
                }`}>
                  <button
                    onClick={() => list.setShowHidden(false)}
                    className={`h-8 rounded-md text-xs font-semibold transition-all ${
                      !list.showHidden
                        ? isGlass && isDark ? "bg-white/20 text-white" : "bg-white text-slate-800"
                        : isGlass && isDark ? "text-white/45 hover:text-white/80" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    일반
                  </button>
                  <button
                    onClick={() => list.setShowHidden(true)}
                    className={`h-8 rounded-md text-xs font-semibold transition-all ${
                      list.showHidden
                        ? isGlass && isDark ? "bg-white/20 text-white" : "bg-white text-slate-800"
                        : isGlass && isDark ? "text-white/45 hover:text-white/80" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    숨긴 자소서
                  </button>
                </div>
                <select
                  value={list.companyTypeFilter}
                  onChange={(e) => list.setCompanyTypeFilter(e.target.value)}
                  className={`w-full h-8 px-2.5 text-xs font-semibold rounded-md border outline-none transition-colors ${
                    isGlass && isDark
                      ? "bg-white/10 border-white/20 text-white focus:border-white/40"
                      : "bg-white border-slate-200 text-slate-600 focus:border-indigo-300"
                  }`}
                >
                  {COMPANY_TYPE_FILTERS.map((type) => (
                    <option key={type || "all"} value={type}>{type || "기업분류 전체"}</option>
                  ))}
                </select>

                {/* 직무 카테고리 필터 */}
                <div>
                  <p className={`mb-1.5 text-2xs font-semibold uppercase tracking-wide ${isGlass && isDark ? "text-white/35" : "text-slate-400"}`}>직무</p>
                  <div className="flex flex-wrap gap-1">
                    {JOB_CATEGORY_FILTERS.map((item) => (
                      <button
                        key={item.value || "all"}
                        onClick={() => list.setJobCategoryFilter(item.value)}
                        className={`rounded-sm px-2 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          list.jobCategoryFilter === item.value
                            ? "bg-indigo-600 text-white"
                            : isGlass && isDark
                              ? "bg-white/10 text-white/60 hover:bg-white/20"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => window.location.assign("/recruit/spec")}
                  className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-all disabled:opacity-50 ${
                    isGlass && isDark
                      ? "border-indigo-400/30 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30"
                      : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                >
                  스펙 분석 페이지
                </button>
              </div>
            </div>

            {/* List */}
            <div onScroll={list.handleListScroll} className="flex-1 overflow-y-auto">
              {list.filtered.length === 0 && !list.loading && (
                <div className={`flex flex-col items-center justify-center h-full gap-2 ${isDark ? "text-white/30" : "text-slate-300"}`}>
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <path d="M6 4h20v24H6V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M10 10h12M10 15h12M10 20h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm">{list.showHidden ? "숨긴 자소서가 없습니다" : "자소서가 없습니다"}</p>
                </div>
              )}
              {list.filtered.map((cl) => (
                <button
                  key={cl.id}
                  onClick={() => list.handleSelect(cl)}
                  className={`w-full text-left px-4 py-3.5 border-b transition-colors ${
                    list.selected?.id === cl.id
                      ? isGlass ? isDark ? "bg-white/10 border-white/10" : "bg-indigo-50/80 border-black/10" : "bg-indigo-50 border-slate-100"
                      : isGlass ? isDark ? "hover:bg-white/5 border-white/5" : "hover:bg-black/5 border-black/5" : "hover:bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isDark ? "text-white/90" : "text-slate-800"}`}>
                        {cl.company || "기업명 없음"}
                      </p>
                      <p className={`text-xs mt-0.5 truncate ${isDark ? "text-white/50" : "text-slate-500"}`}>
                        {[cl.position, cl.season].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {cl.source === "catch" && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-sm ${isDark ? "bg-sky-500/15 text-sky-300" : "bg-sky-50 text-sky-600"}`}>캐치</span>
                    )}
                    {(!cl.source || cl.source === "linkareer") && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-sm ${isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-600"}`}>링커리어</span>
                    )}
                    {cl.jobCategory && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-sm ${isDark ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>{cl.jobCategory}</span>
                    )}
                    {cl.isHidden && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-sm ${isDark ? "bg-rose-500/20 text-rose-300" : "bg-rose-50 text-rose-600"}`}>숨김</span>
                    )}
                    {cl.companyType && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-sm ${isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500"}`}>{cl.companyType}</span>
                    )}
                    {cl.questions.length > 0 && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-sm ${isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"}`}>{cl.questions.length}문항</span>
                    )}
                  </div>
                  {cl.questions[0] && (
                    <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${isDark ? "text-white/35" : "text-slate-400"}`}>
                      {cl.questions[0].answer || cl.questions[0].question}
                    </p>
                  )}
                </button>
              ))}
              <div ref={list.loaderRef} className="pt-3 pb-12 flex justify-center">
                {list.loading && <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin block" />}
              </div>
            </div>
          </div>

          {/* Right side: detail + analysis sidebar */}
          <div className="flex-1 flex min-w-0 overflow-hidden">
            {/* Detail */}
            <div onScroll={list.handleDetailScroll} className={`flex-1 overflow-y-auto ${list.selected ? "flex" : "hidden lg:flex"} flex-col`}>
              {!list.selected ? (
                <div className={`flex flex-col items-center justify-center h-full gap-3 ${isDark ? "text-white/25" : "text-slate-300"}`}>
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <path d="M8 5h24v30H8V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M13 13h14M13 19h14M13 25h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm">자소서를 선택하세요</p>
                </div>
              ) : (
                <div className="px-3 pt-3 pb-20 sm:px-8 sm:pt-6 sm:pb-24 sm:max-w-3xl w-full mx-auto">
                  <div className="mb-5 sm:mb-6">
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                        합격 자소서
                      </span>
                      {list.selected.isHidden && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm ${isDark ? "bg-rose-500/20 text-rose-300" : "bg-rose-50 text-rose-600"}`}>
                          숨김
                        </span>
                      )}
                      {list.selected.companyType && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-700"}`}>
                          {list.selected.companyType}
                        </span>
                      )}
                      {list.selected.jobCategory && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm ${isDark ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
                          {list.selected.jobCategory}
                        </span>
                      )}
                    </div>
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
                      <h1 className={`text-[28px] sm:text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{list.selected.company}</h1>
                      <button
                        onClick={handleSelectedHiddenToggle}
                        disabled={hideLoading}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          list.selected.isHidden
                            ? isDark ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : isDark ? "border-rose-400/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25" : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
                      >
                        {hideLoading && <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                        {list.selected.isHidden ? "숨김 해제" : "숨김"}
                      </button>
                    </div>
                    <div className={`flex flex-wrap gap-2 text-sm ${isDark ? "text-white/50" : "text-slate-500"}`}>
                      {list.selected.position && <span>{list.selected.position}</span>}
                      {list.selected.position && list.selected.season && <span>·</span>}
                      {list.selected.season && <span>{list.selected.season}</span>}
                    </div>
                    {list.selected.spec && (
                      <p className={`mt-2 text-[15px] leading-relaxed ${isDark ? "text-white/40" : "text-slate-400"}`}>{list.selected.spec}</p>
                    )}
                  </div>

                  <div className={`border-t mb-6 ${isDark ? "border-white/10" : "border-slate-100"}`} />

                  {list.selected.questions.length === 0 ? (
                    <p className={`text-sm ${isDark ? "text-white/40" : "text-slate-400"}`}>내용이 없습니다.</p>
                  ) : (
                    <div className="space-y-7 sm:space-y-8">
                      {list.selected.questions.map((q, i) => (
                        <div key={i}>
                          <p className={`text-[15px] sm:text-sm font-semibold mb-3 leading-relaxed ${isDark ? "text-white/80" : "text-slate-700"}`}>
                            <span className={`inline-block w-5 h-5 rounded-sm text-xs font-bold text-center leading-5 mr-2 shrink-0 ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-500"}`}>
                              {q.number}
                            </span>
                            {q.question}
                          </p>
                          <p className={`text-[15px] sm:text-sm leading-8 sm:leading-7 whitespace-pre-wrap pl-0 sm:pl-7 ${isDark ? "text-white/70" : "text-slate-600"}`}>
                            {q.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Analysis sidebar */}
            {showAnalysis && (
              <div className={`hidden xl:flex flex-col w-80 2xl:w-90 shrink-0 border-l overflow-hidden ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-200"}`}>
                <div className={`shrink-0 flex items-center justify-between px-3 py-2.5 border-b ${isGlass ? (isDark ? "border-white/10" : "border-black/10") : "border-slate-100"} ${isGlass ? "" : "bg-white"}`}>
                  <div className="flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-violet-500">
                      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M4.5 6.5h4M6.5 4.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <span className={`text-xs font-semibold ${isDark ? "text-white/70" : "text-slate-700"}`}>기업 분석</span>
                    {list.selected?.company && (
                      <span className={`text-xs ${isDark ? "text-white/35" : "text-slate-400"}`}>· {list.selected.company}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowAnalysis(false)}
                    className={`text-slate-300 hover:text-slate-500 transition-colors`}
                    title="패널 닫기"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <CompanyAnalysisPanel initialQuery={list.selected?.company ?? ""} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoverLetterPage() {
  return (
    <Suspense fallback={<div className="h-full bg-slate-100" />}>
      <CoverLetterPageContent />
    </Suspense>
  );
}
