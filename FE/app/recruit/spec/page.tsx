"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  enqueueSpecAnalysis,
  streamSpecAnalysis,
  getSpecAnalyses,
  listCoverLetters,
  type CoverLetter,
  type CoverLetterJobAnalysis,
  type JobCategory,
} from "@/lib/api/recruit/cover-letter";
import { MODELS } from "../_constants";
import { RadarChart } from "./_components/RadarChart";
import { CoverLetterSelectionPanel, SpecHeaderSection } from "./_components/SpecPageSections";
import {
  buildCategoryAverages,
  categoryTone,
  specChips,
  type AnalyzedCoverLetter,
  type TargetFilter,
} from "./_lib/spec-analysis";

export default function RecruitSpecPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [items, setItems] = useState<CoverLetter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [companyType, setCompanyType] = useState("");

  const [model, setModel] = useState(MODELS[0]?.id ?? "");

  const [analyses, setAnalyses] = useState<Record<string, CoverLetterJobAnalysis>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLog, setAnalysisLog] = useState<string>("");
  const [analyzedModel, setAnalyzedModel] = useState("");
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [selectedAverageCategory, setSelectedAverageCategory] = useState<JobCategory | null>(null);
  const [target, setTarget] = useState<TargetFilter>("IT+전자");
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const inputClass = isDark
    ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50"
    : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const categoryAverages = useMemo(() => buildCategoryAverages(analyses), [analyses]);
  const selectedAverage = useMemo(() => {
    if (categoryAverages.length === 0) return null;
    return categoryAverages.find((row) => row.category === selectedAverageCategory) ?? categoryAverages[0];
  }, [categoryAverages, selectedAverageCategory]);
  const selectedCategoryItems = useMemo<AnalyzedCoverLetter[]>(() => {
    if (!selectedAverage) return [];
    return items
      .map((item) => ({ item, analysis: analyses[item.id] }))
      .filter((entry): entry is AnalyzedCoverLetter => Boolean(entry.analysis))
      .filter(({ analysis }) => analysis.jobCategory === selectedAverage.category);
  }, [analyses, items, selectedAverage]);
  const selectedDetail = useMemo(
    () => selectedCategoryItems.find(({ item }) => item.id === selectedDetailId) ?? null,
    [selectedCategoryItems, selectedDetailId],
  );

  const MAX_SELECT = 20;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      return next;
    });
  const selectN = (n: number) =>
    setSelectedIds(
      new Set(items.filter((item) => !analyses[item.id]).slice(0, n).map((item) => item.id)),
    );
  const selectUnanalyzed = () =>
    setSelectedIds(new Set(items.filter((item) => !analyses[item.id]).slice(0, MAX_SELECT).map((item) => item.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const PAGE_SIZE = 20;

  const load = async (p = 1, reset = true) => {
    setLoading(true);
    if (reset) setError(null);
    try {
      const res = await listCoverLetters(p, PAGE_SIZE, {
        source: source || undefined,
        companyType: companyType || undefined,
        search: search.trim() || undefined,
        sort: "latest",
      });
      setTotal(res.total);
      setHasMore(res.hasNext ?? false);
      setPage(p);
      if (reset) {
        setItems(res.items);
        setSelectedIds(new Set());
        setAnalysisError(null);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
        });
      }
      // DB에 저장된 분석 결과 로드
      const saved = await getSpecAnalyses(res.items.map((i) => i.id));
      if (saved.length > 0) {
        const savedIds = new Set(saved.map((s) => s.id));
        setAnalyses((prev) => {
          const next = { ...prev };
          for (const item of saved) next[item.id] = item;
          return next;
        });
        // 이미 분석된 항목은 선택에서 제거
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of savedIds) next.delete(id);
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "자소서 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => load(page + 1, false);

  useEffect(() => {
    load(1, true);
  }, [source, companyType]);

  const runAnalysis = async () => {
    const targetIds = selectedIds.size > 0
      ? [...selectedIds]
      : items.filter((item) => !analyses[item.id]).slice(0, 20).map((item) => item.id);
    if (targetIds.length === 0 || analyzing) return;

    analysisAbortRef.current?.abort();
    const ctrl = new AbortController();
    analysisAbortRef.current = ctrl;

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisLog("");
    try {
      const { jobId } = await enqueueSpecAnalysis({
        ids: targetIds,
        target,
        model,
        limit: targetIds.length,
      });
      await streamSpecAnalysis(
        jobId,
        (event) => {
          if (event.type === "log") {
            setAnalysisLog(event.message);
          } else if (event.type === "done" && event.payload) {
            const res = event.payload;
            setAnalyses((prev) => {
              const next = { ...prev };
              for (const item of res.items) next[item.id] = item;
              return next;
            });
            setAnalyzedModel(res.model);
            setAnalysisLog("");
          } else if (event.type === "error") {
            setAnalysisError(event.message);
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setAnalysisError(e instanceof Error ? e.message : "AI 스펙 분석에 실패했습니다.");
      }
    } finally {
      setAnalyzing(false);
      setAnalysisLog("");
    }
  };

  useEffect(() => {
    if (categoryAverages.length === 0) {
      if (selectedAverageCategory) setSelectedAverageCategory(null);
      return;
    }
    if (!selectedAverageCategory || !categoryAverages.some((row) => row.category === selectedAverageCategory)) {
      setSelectedAverageCategory(categoryAverages[0].category);
      setSelectedDetailId(null);
    }
  }, [categoryAverages, selectedAverageCategory]);

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <SpecHeaderSection
          search={search}
          source={source}
          companyType={companyType}
          target={target}
          model={model}
          loading={loading}
          analyzing={analyzing}
          selectedCount={selectedIds.size}
          itemCount={items.length}
          total={total}
          analyzedModel={analyzedModel}
          analysisLog={analysisLog}
          analysisError={analysisError}
          error={error}
          isDark={isDark}
          panelClass={panelClass}
          inputClass={inputClass}
          textMain={textMain}
          textSub={textSub}
          onBack={() => router.push("/recruit")}
          onSearchChange={setSearch}
          onSourceChange={setSource}
          onCompanyTypeChange={setCompanyType}
          onTargetChange={setTarget}
          onModelChange={setModel}
          onSubmitSearch={() => load(1, true)}
          onRunAnalysis={runAnalysis}
        />

        <CoverLetterSelectionPanel
          items={items}
          analyses={analyses}
          selectedIds={selectedIds}
          hasMore={hasMore}
          loading={loading}
          total={total}
          isDark={isDark}
          panelClass={panelClass}
          textMain={textMain}
          textSub={textSub}
          onSelectUnanalyzed={selectUnanalyzed}
          onSelectN={selectN}
          onClearSelection={clearSelection}
          onToggleSelect={toggleSelect}
          onLoadMore={loadMore}
        />

        <section className={`min-h-[28rem] rounded-md border p-5 ${panelClass}`}>
          {loading ? (
            <div className={`flex h-80 items-center justify-center text-sm ${textSub}`}>자소서 데이터를 불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className={`flex h-80 items-center justify-center text-sm ${textSub}`}>분석할 데이터가 없습니다.</div>
          ) : Object.keys(analyses).length === 0 ? (
            <div className={`flex h-80 flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
              <span>자소서를 선택하고 AI 스펙 분석을 실행하세요.</span>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {selectedIds.size > 0 ? `선택 ${selectedIds.size}건 분석` : "AI 스펙 분석 (미분석 상위 20건)"}
              </button>
            </div>
          ) : categoryAverages.length === 0 || !selectedAverage ? (
            <div className={`flex h-80 items-center justify-center text-sm ${textSub}`}>아직 평균 스펙을 만들 분석 결과가 없습니다.</div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1fr_21rem]">
              <article className={`rounded-md border p-5 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
                <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-sm border px-4 py-1.5 text-sm font-black ${isDark ? "border-blue-400/40 bg-blue-500/10 text-blue-200" : "border-blue-300 bg-blue-50 text-blue-500"}`}>
                        평균 스펙
                      </span>
                      <h2 className={`text-xl sm:text-3xl font-black tracking-tight ${isDark ? "text-blue-300" : "text-blue-500"}`}>
                        {selectedAverage.category}
                      </h2>
                      <span className={`rounded-sm px-3 py-1 text-xs font-bold ${categoryTone(selectedAverage.category, isDark)}`}>
                        {selectedAverage.count}건
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className={`text-xl sm:text-3xl font-black ${textMain}`}>{selectedAverage.category} 합격자 평균</p>
                        <p className={`mt-3 max-w-3xl text-xs sm:text-sm font-semibold leading-relaxed ${textSub}`}>
                          {selectedAverage.summary || "아직 평균 요약에 사용할 스펙 항목이 충분하지 않습니다."}
                        </p>
                      </div>
                      <button
                        onClick={() => setTarget(selectedAverage.category as TargetFilter)}
                        className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${isDark ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        분석 대상 지정
                      </button>
                    </div>

                    <div className={`mt-8 grid grid-cols-2 overflow-hidden rounded-md border sm:grid-cols-5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                      {selectedAverage.metrics.map((metric) => (
                        <div
                          key={`${selectedAverage.category}-${metric.label}`}
                          className={`flex min-h-[5.5rem] sm:min-h-32 w-full flex-col items-center justify-center overflow-hidden border-b border-r p-1.5 sm:p-2 text-center last:border-r-0 ${isDark ? "border-white/10" : "border-slate-200"}`}
                        >
                          <span className={`w-full overflow-hidden text-ellipsis whitespace-nowrap font-black tracking-tight ${textMain} ${
                            metric.value.length > 7 ? "text-[11px] sm:text-base" : metric.value.length > 5 ? "text-xs sm:text-xl" : metric.value.length > 3 ? "text-sm sm:text-2xl" : "text-lg sm:text-4xl"
                          }`}>
                            {metric.value}
                          </span>
                          <span className={`mt-1.5 text-[10px] sm:text-xs font-bold ${isDark ? "text-white/55" : "text-slate-500"}`}>{metric.sub}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-1.5">
                      {selectedAverage.chips.length === 0 ? (
                        <span className={`text-xs ${textSub}`}>추출된 대표 스펙 키워드가 없습니다.</span>
                      ) : (
                        selectedAverage.chips.map((chip, index) => (
                          <span key={`${selectedAverage.category}-${chip}-${index}`} className={`rounded-sm border px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold ${isDark ? "border-white/10 bg-white/5 text-white/60" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {chip}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center">
                    <div className="text-center">
                      <p className={`text-xs sm:text-sm font-black ${textSub}`}>평균 스펙지수</p>
                      <p className={`text-4xl sm:text-7xl font-black leading-none ${isDark ? "text-blue-300" : "text-blue-500"}`}>{selectedAverage.specIndex}</p>
                    </div>
                    <RadarChart metrics={selectedAverage.metrics} isDark={isDark} />
                  </div>
                </div>

                <div className={`mt-6 rounded-md border p-4 ${isDark ? "border-white/10 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className={`text-base font-black ${textMain}`}>세부정보</h3>
                      <p className={`mt-0.5 text-xs ${textSub}`}>
                        {selectedAverage.category}로 분류된 합격 자소서 {selectedCategoryItems.length}건
                      </p>
                    </div>
                    {selectedDetail && (
                      <button
                        onClick={() => setSelectedDetailId(null)}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${isDark ? "bg-white/10 text-white/60 hover:bg-white/15" : "bg-white text-slate-500 hover:bg-slate-100"}`}
                      >
                        접기
                      </button>
                    )}
                  </div>

                  {selectedCategoryItems.length === 0 ? (
                    <p className={`rounded-md border px-3 py-4 text-sm ${isDark ? "border-white/10 text-white/45" : "border-slate-200 text-slate-500"}`}>
                      이 카테고리에 표시할 세부 항목이 없습니다.
                    </p>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {selectedCategoryItems.map(({ item, analysis }) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedDetailId((prev) => prev === item.id ? null : item.id)}
                            className={`w-full rounded-md border p-3 text-left transition-colors ${
                              selectedDetail?.item.id === item.id
                                ? isDark ? "border-blue-400/40 bg-blue-500/15" : "border-blue-200 bg-white"
                                : isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className={`min-w-0 truncate text-sm font-black ${textMain}`}>{item.company || "기업명 없음"}</p>
                              <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[10px] font-bold ${categoryTone(analysis.jobCategory, isDark)}`}>
                                {Math.round(analysis.confidence * 100)}%
                              </span>
                            </div>
                            <p className={`mt-1 truncate text-xs font-semibold ${textSub}`}>{item.position || "직무 없음"}</p>
                            <p className={`mt-2 line-clamp-2 text-xs leading-relaxed ${isDark ? "text-white/60" : "text-slate-600"}`}>
                              {analysis.extractedSpec.summary || item.spec || "추출된 스펙 요약이 없습니다."}
                            </p>
                          </button>
                        ))}
                      </div>

                      <div className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-white"}`}>
                        {!selectedDetail ? (
                          <div className={`flex h-full min-h-64 items-center justify-center text-center text-sm leading-relaxed ${textSub}`}>
                            왼쪽 항목을 선택하면<br />추출 스펙과 분류 사유를 확인할 수 있습니다.
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`truncate text-lg font-black ${textMain}`}>{selectedDetail.item.company || "기업명 없음"}</p>
                                <p className={`mt-1 text-sm font-semibold ${textSub}`}>{selectedDetail.item.position || "직무 없음"}</p>
                                {selectedDetail.item.season && (
                                  <p className={`mt-0.5 text-xs ${textSub}`}>{selectedDetail.item.season}</p>
                                )}
                              </div>
                              <button
                                onClick={() => router.push(`/recruit/cover-letter?cover=${encodeURIComponent(selectedDetail.item.id)}`)}
                                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${isDark ? "bg-blue-500/20 text-blue-200 hover:bg-blue-500/30" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                              >
                                자소서 보기
                              </button>
                            </div>

                            <div className="mt-4 space-y-3">
                              <div>
                                <p className={`mb-1 text-xs font-black ${textSub}`}>추출 스펙</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {specChips(selectedDetail.analysis.extractedSpec).length === 0 ? (
                                    <span className={`text-xs ${textSub}`}>추출된 스펙 항목이 없습니다.</span>
                                  ) : (
                                    specChips(selectedDetail.analysis.extractedSpec).slice(0, 18).map((chip, index) => (
                                      <span key={`${selectedDetail.item.id}-${chip}-${index}`} className={`rounded-sm border px-2.5 py-1 text-xs font-semibold ${isDark ? "border-white/10 bg-white/5 text-white/60" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                        {chip}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>

                              <div>
                                <p className={`mb-1 text-xs font-black ${textSub}`}>분류 사유</p>
                                <p className={`rounded-md px-3 py-2 text-sm leading-relaxed ${isDark ? "bg-white/5 text-white/65" : "bg-slate-50 text-slate-600"}`}>
                                  {selectedDetail.analysis.reason || "분류 사유가 없습니다."}
                                </p>
                              </div>

                              {selectedDetail.item.spec && (
                                <div>
                                  <p className={`mb-1 text-xs font-black ${textSub}`}>원본 스펙</p>
                                  <p className={`rounded-md px-3 py-2 text-sm leading-relaxed ${isDark ? "bg-white/5 text-white/65" : "bg-slate-50 text-slate-600"}`}>
                                    {selectedDetail.item.spec}
                                  </p>
                                </div>
                              )}

                              <div className={`grid grid-cols-2 gap-2 text-xs ${textSub}`}>
                                <div className={`rounded-md px-3 py-2 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                                  문항 {selectedDetail.item.questions.length}개
                                </div>
                                <div className={`rounded-md px-3 py-2 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                                  조회 {selectedDetail.item.viewCount?.toLocaleString() ?? "-"}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>

              <aside className={`rounded-md border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between px-1 pb-3">
                  <h2 className={`text-base font-black ${textMain}`}>카테고리 목록</h2>
                  <span className={`text-sm font-bold ${textSub}`}>{categoryAverages.length}개</span>
                </div>
                <div className="max-h-[42rem] space-y-2 overflow-y-auto pr-1">
                  {categoryAverages.map((row) => (
                    <button
                      key={row.category}
                      onClick={() => {
                        setSelectedAverageCategory(row.category);
                        setTarget(row.category as TargetFilter);
                        setSelectedDetailId(null);
                      }}
                      className={`w-full rounded-md border p-4 text-left transition-colors ${
                        selectedAverage.category === row.category
                          ? isDark ? "border-blue-400/40 bg-blue-500/15" : "border-blue-200 bg-blue-50"
                          : isDark ? "border-white/10 bg-slate-900/60 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`min-w-0 truncate text-lg font-black ${textMain}`}>{row.category}</p>
                        <span className={`shrink-0 rounded-sm px-2.5 py-1 text-xs font-bold ${categoryTone(row.category, isDark)}`}>
                          {row.count}건
                        </span>
                      </div>
                      <p className={`mt-1 text-xs font-bold ${textSub}`}>평균 스펙지수 {row.specIndex}</p>
                      <p className={`mt-3 line-clamp-3 text-sm leading-relaxed ${isDark ? "text-white/60" : "text-slate-600"}`}>
                        {row.summary || "요약할 스펙 항목이 부족합니다."}
                      </p>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
