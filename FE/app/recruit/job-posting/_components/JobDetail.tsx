"use client";

import { useState, useRef, useCallback, useEffect, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import type { JobPosting } from "@/lib/api/recruit/job-posting";
import { getJobPostingAiAnalysis, saveJobPostingAiAnalysis, getPostingImageFiles, type AiAnalysisMode } from "@/lib/api/recruit/job-posting";
import { listCoverLetters, type CoverLetter } from "@/lib/api/recruit/cover-letter";
import { enqueueWriteAssist, streamWriteAssist } from "@/lib/api/ai";
import { BE_BASE } from "@/lib/api/base";
import { listCompanies } from "@/lib/api/companies";
import { getDdayLabel, normalizeType } from "../_utils";
import { FavoriteIcon } from "./FavoriteIcon";
import { PROSE_CLASS } from "../../_constants";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

type AiMode = "analysis" | "interview" | null;

interface JobDetailProps {
  selected: JobPosting;
  detailLoading: boolean;
  onToggleFavorite: (p: JobPosting, e?: MouseEvent<HTMLElement>) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function JobDetail({ selected, detailLoading, onToggleFavorite, onScroll }: JobDetailProps) {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const [aiMode, setAiMode] = useState<AiMode>(null);
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevIdRef = useRef<string>("");

  // Cover letter picker state
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerItems, setPickerItems] = useState<CoverLetter[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [cachedDocIds, setCachedDocIds] = useState<{ analysis: string | null; interview: string | null }>({ analysis: null, interview: null });

  const selectedDday = getDdayLabel(selected);

  // Reset state and load image files + cached docIds when posting changes
  useEffect(() => {
    if (prevIdRef.current === selected.id) return;
    prevIdRef.current = selected.id;
    setAiMode(null);
    setAiResult("");
    setImageFiles([]);
    setCompanyId(null);
    setCoverLetter(null);
    setPickerOpen(false);
    setPickerSearch("");
    setCachedDocIds({ analysis: null, interview: null });

    if (selected.company) {
      listCompanies({ q: selected.company, limit: 1 })
        .then((items) => { if (items[0]) setCompanyId(items[0].id); })
        .catch(() => {});
    }

    if (selected.detailHtml && /src=["']\/api\/recruit\/job-postings\/image\//.test(selected.detailHtml)) {
      getPostingImageFiles(selected.detailHtml)
        .then(({ files }) => setImageFiles(files))
        .catch(() => {});
    }

    // Pre-load cached docIds so picker can show "분석됨" badges
    Promise.all([
      getJobPostingAiAnalysis(selected.id, "analysis").catch(() => null),
      getJobPostingAiAnalysis(selected.id, "interview").catch(() => null),
    ]).then(([a, b]) => {
      setCachedDocIds({
        analysis: a?.docId ?? null,
        interview: b?.docId ?? null,
      });
    });
  }, [selected.id, selected.detailHtml]);

  const openPicker = useCallback(async () => {
    setPickerOpen((v) => !v);
    if (pickerItems.length > 0) return;
    setPickerLoading(true);
    try {
      const res = await listCoverLetters(1, 100);
      setPickerItems(res.items);
    } catch {}
    setPickerLoading(false);
  }, [pickerItems.length]);

  const getPostingContent = useCallback(() => {
    let detailText = selected.detailContent ?? "";
    if (!detailText && selected.detailHtml) {
      const tmp = document.createElement("div");
      tmp.innerHTML = selected.detailHtml;
      detailText = (tmp.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 3000);
    }
    const parts = [
      `회사: ${selected.company}`,
      `직무: ${selected.title}`,
      selected.type ? `고용형태: ${normalizeType(selected.type)}` : null,
      selected.location ? `근무지: ${selected.location}` : null,
      selected.jobs ? `모집직무: ${selected.jobs}` : null,
      selected.companyType ? `기업형태: ${selected.companyType}` : null,
      selected.deadline ? `마감: ${selected.deadline}` : null,
      detailText ? `\n상세내용:\n${detailText}` : null,
    ];
    return parts.filter(Boolean).join("\n");
  }, [selected]);

  const loadCachedResult = useCallback(async (mode: AiAnalysisMode) => {
    try {
      const { text, docId } = await getJobPostingAiAnalysis(selected.id, mode);
      if (text) {
        setAiMode(mode);
        setAiResult(text);
        setCachedDocIds((prev) => ({ ...prev, [mode]: docId }));
        return true;
      }
    } catch {}
    return false;
  }, [selected.id]);

  const runAi = useCallback(
    async (mode: AiMode) => {
      if (!mode) return;

      // Show cached result if available
      const hasCached = await loadCachedResult(mode as AiAnalysisMode);
      if (hasCached) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setAiMode(mode);
      setAiResult("");
      setAiLoading(true);

      const content = getPostingContent();

      const coverLetterSection = coverLetter
        ? `\n\n지원자 자기소개서:\n스펙: ${coverLetter.spec}\n\n${coverLetter.questions.map((q) => `Q. ${q.question}\nA. ${q.answer}`).join("\n\n")}`
        : "";

      const instruction =
        mode === "analysis"
          ? `다음 채용 공고를 분석해서 아래 형식으로 답변해주세요.\n\n**핵심 자격 요건**\n- ...\n\n**우대 사항**\n- ...\n\n**직무 핵심**\n- ...${coverLetter ? "\n\n**자기소개서 적합도**\n첨부된 자기소개서를 이 공고와 비교해 강점, 보완점, 지원 적합성을 분석해주세요." : ""}\n\n**숨겨진 요구사항**\n공고에 명시되지 않았지만 맥락상 예상되는 사항을 분석해주세요.\n\n**지원 전략**\n이 공고에 합격하기 위한 핵심 전략을 제시해주세요.\n\n채용 공고:\n${content}${coverLetterSection}`
          : `다음 채용 공고를 바탕으로 실제 면접에서 나올 수 있는 예상 질문 10개를 생성해주세요.${coverLetter ? "\n첨부된 자기소개서를 참고해 자소서 기반 질문도 포함해주세요." : ""}\n\n**기술 면접 질문** (5개)\n각 질문마다 출제 의도와 핵심 답변 방향을 함께 제시해주세요.\n\n**인성/행동 면접 질문** (3개)\nSTAR 기법으로 답변할 수 있는 질문과 의도를 제시해주세요.\n\n**기업/산업 관련 질문** (2개)\n해당 기업과 산업에 특화된 질문과 답변 포인트를 제시해주세요.\n\n채용 공고:\n${content}${coverLetterSection}`;

      let finalResult = "";
      try {
        const { jobId } = await enqueueWriteAssist("", instruction, DEFAULT_MODEL, undefined, imageFiles.length ? imageFiles : undefined);
        await streamWriteAssist(
          jobId,
          (event) => {
            if (event.type === "chunk" && event.text) {
              finalResult += event.text;
              setAiResult((prev) => prev + event.text);
            }
          },
          ctrl.signal,
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setAiResult("분석 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
      } finally {
        setAiLoading(false);
        if (finalResult && !ctrl.signal.aborted) {
          const docId = coverLetter?.id ?? null;
          saveJobPostingAiAnalysis(selected.id, mode as AiAnalysisMode, finalResult, docId).catch((err) => {
            console.error("[JobDetail] AI 분석 저장 실패:", err);
          });
          if (docId) setCachedDocIds((prev) => ({ ...prev, [mode]: docId }));
        }
      }
    },
    [selected.id, getPostingContent, loadCachedResult, coverLetter, imageFiles],
  );

  const handleCompanyAnalysis = () => {
    router.push(`/companies/analysis?company=${encodeURIComponent(selected.company)}`);
  };

  const sourceLabel =
    selected.source === "jobkorea"
      ? "잡코리아"
      : selected.source === "catch"
        ? "캐치"
        : selected.source === "jobplanet"
          ? "잡플래닛"
          : selected.source === "jobda"
            ? "잡다"
            : selected.source === "linkareer" || !selected.source
              ? "링커리어"
              : selected.source;

  const metaItems = [
    selected.location && { icon: "pin", text: selected.location },
    (selected.startDate || selected.endDate)
      ? { icon: "cal", text: `${selected.startDate} ~ ${selected.endDate}` }
      : selected.deadline
        ? { icon: "cal", text: selected.deadline }
        : null,
    selected.companyType && { icon: null, text: selected.companyType },
  ].filter(Boolean) as { icon: string | null; text: string }[];

  return (
    <div onScroll={onScroll} className={`h-full min-h-0 flex-1 overflow-y-auto flex flex-col transition-all ${isDark ? "bg-slate-950" : "bg-[#F8F9FA]"}`}>
      <div className="p-0 sm:p-6 w-full max-w-3xl mx-auto">
        <div className={`sm:rounded-xl overflow-hidden transition-all ${isDark ? "bg-slate-900 border border-slate-800" : "bg-white sm:border sm:border-slate-200/80"}`}>

          {/* Header */}
          <div className={`px-5 sm:px-8 pt-6 sm:pt-8 pb-5 sm:pb-6 border-b ${isDark ? "border-slate-800" : "border-slate-100"}`}>
            {/* Top row: badges + save */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                {selected.type && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {normalizeType(selected.type)}
                  </span>
                )}
                {selectedDday && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    selectedDday === "마감"
                      ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      : selectedDday === "D-Day"
                        ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                        : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                  }`}>
                    {selectedDday}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => onToggleFavorite(selected, e)}
                aria-label={selected.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  selected.favorite
                    ? "bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50"
                    : "border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-200 hover:bg-amber-50 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                <FavoriteIcon active={!!selected.favorite} />
                {selected.favorite ? "저장됨" : "저장"}
              </button>
            </div>

            {/* Company */}
            <button
              type="button"
              onClick={() => router.push(
                companyId ? `/companies/${companyId}` : `/companies?q=${encodeURIComponent(selected.company)}`
              )}
              className={`text-sm font-semibold mb-1.5 hover:underline transition-colors text-left ${isDark ? "text-slate-400 hover:text-indigo-400" : "text-slate-500 hover:text-indigo-600"}`}
            >
              {selected.company}
            </button>

            {/* Title */}
            <h1 className={`text-xl sm:text-2xl font-bold leading-snug mb-4 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              {selected.title}
            </h1>

            {/* Meta row */}
            {metaItems.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {metaItems.map((m, i) => (
                  <span key={i} className={`flex items-center gap-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {m.icon === "pin" && (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
                        <path d="M8 1.5c-3.3 0-6 2.7-6 6 0 3.8 6 7.5 6 7.5s6-3.7 6-7.5c0-3.3-2.7-6-6-6zm0 8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor" />
                      </svg>
                    )}
                    {m.icon === "cal" && (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
                        <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M5 1.5v3M11 1.5v3M2 6.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                    {m.text}
                  </span>
                ))}
                {selected.homepage && (
                  <a
                    href={selected.homepage.startsWith("http") ? selected.homepage : `https://${selected.homepage}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-500 hover:text-indigo-700 hover:underline dark:text-indigo-400"
                  >
                    {selected.homepage}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* AI Tools — minimal toolbar */}
          <div className={`px-5 sm:px-8 py-3 border-b flex flex-wrap items-center gap-2 ${isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-100 bg-slate-50/60"}`}>
            <button
              onClick={() => runAi("analysis")}
              disabled={aiLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all disabled:opacity-50 ${
                aiMode === "analysis" && (aiLoading || aiResult)
                  ? "bg-indigo-600 text-white"
                  : isDark ? "text-indigo-300 hover:bg-indigo-950/40" : "text-indigo-600 hover:bg-indigo-50"
              }`}
            >
              {aiLoading && aiMode === "analysis"
                ? <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              }
              공고 분석
            </button>
            <button
              onClick={() => runAi("interview")}
              disabled={aiLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all disabled:opacity-50 ${
                aiMode === "interview" && (aiLoading || aiResult)
                  ? "bg-violet-600 text-white"
                  : isDark ? "text-violet-300 hover:bg-violet-950/40" : "text-violet-600 hover:bg-violet-50"
              }`}
            >
              {aiLoading && aiMode === "interview"
                ? <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 1H2C1.45 1 1 1.45 1 2V8c0 .55.45 1 1 1h2l2 2 2-2h2c.55 0 1-.45 1-1V2c0-.55-.45-1-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
              }
              면접 질문
            </button>
            <button
              onClick={handleCompanyAnalysis}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${isDark ? "text-emerald-300 hover:bg-emerald-950/40" : "text-emerald-600 hover:bg-emerald-50"}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M4 8L8 4M8 4H5.5M8 4V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              기업 분석
            </button>
            <div className={`w-px h-4 self-center ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
            <button
              onClick={openPicker}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                coverLetter
                  ? "text-orange-600 bg-orange-50 dark:text-orange-350 dark:bg-orange-950/40"
                  : isDark ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 1.5h8a.5.5 0 01.5.5v8a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5V2a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.5" /><path d="M4 4h4M4 6h4M4 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              {coverLetter ? coverLetter.company : "자소서"}
              {coverLetter && (
                <span role="button" onClick={(e) => { e.stopPropagation(); setCoverLetter(null); }} className="opacity-50 hover:opacity-100">×</span>
              )}
            </button>
          </div>

          <div className="px-5 sm:px-8 py-6">
            {/* Cover letter picker panel */}
            {pickerOpen && (
              <div className={`mb-6 border rounded-lg overflow-hidden ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                <div className={`p-2 border-b flex items-center gap-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                  <input
                    autoFocus
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="회사명·직무로 검색"
                    className={`flex-1 text-xs px-2 py-1.5 border rounded-md outline-none focus:border-indigo-300 ${isDark ? "border-slate-700 bg-slate-950/40 text-slate-100" : "border-slate-200 bg-slate-50"}`}
                  />
                  <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-slate-600 px-1">✕</button>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {pickerLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                      <span className="w-3 h-3 border-2 border-slate-200 border-t-indigo-400 rounded-full animate-spin" />불러오는 중...
                    </div>
                  ) : (() => {
                    const q = pickerSearch.trim();
                    const filtered = q
                      ? pickerItems.filter((cl) => cl.company.includes(q) || cl.position.includes(q) || (cl.spec ?? "").includes(q))
                      : pickerItems;
                    if (!filtered.length) return <p className="text-xs text-slate-400 text-center py-5">자소서가 없습니다</p>;
                    return filtered.map((cl) => {
                      const isSelected = coverLetter?.id === cl.id;
                      const analyzedModes = [
                        cachedDocIds.analysis === cl.id ? "분석" : null,
                        cachedDocIds.interview === cl.id ? "면접" : null,
                      ].filter(Boolean);
                      return (
                        <button
                          key={cl.id}
                          onClick={() => { setCoverLetter(isSelected ? null : cl); setPickerOpen(false); setPickerSearch(""); }}
                          className={`w-full text-left px-3 py-2.5 border-b last:border-0 transition-colors ${isSelected ? "bg-orange-50 dark:bg-orange-950/20" : "hover:bg-slate-50 dark:border-slate-800/30 dark:hover:bg-slate-800/40"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate dark:text-slate-200">
                                {cl.company}<span className="text-slate-400 font-normal ml-1">{cl.position}</span>
                              </p>
                              {cl.spec && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{cl.spec}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {analyzedModes.map((m) => (
                                <span key={m} className="text-2xs font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                                  {m}됨
                                </span>
                              ))}
                              {isSelected && (
                                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-orange-500">
                                  <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* AI Result */}
            {(aiResult || (aiLoading && aiMode)) && (
              <div className={`mb-6 rounded-lg border p-4 ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      {aiMode === "analysis" ? "공고 분석" : "면접 예상 질문"}
                    </span>
                    {(() => {
                      const docId = aiMode ? cachedDocIds[aiMode] : null;
                      const usedCl = docId ? pickerItems.find((cl) => cl.id === docId) : null;
                      return usedCl ? (
                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-350">
                          자소서: {usedCl.company}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {!aiLoading && aiResult && (
                    <button onClick={() => { setAiMode(null); setAiResult(""); }} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
                  )}
                </div>
                {aiLoading && !aiResult ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
                    <span className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />분석 중...
                  </div>
                ) : (
                  <div className={`${PROSE_CLASS} text-sm`} dangerouslySetInnerHTML={{ __html: aiResult.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^- (.*)/gm, "• $1") }} />
                )}
              </div>
            )}

            {/* Detail content */}
            <div className="mb-8">
              {detailLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />상세 내용을 불러오는 중...
                </div>
              ) : selected.detailHtml ? (
                <div className="job-detail-html text-[15px] leading-relaxed text-slate-700 dark:text-slate-350" dangerouslySetInnerHTML={{ __html: selected.detailHtml
                    .replace(/\/api\/recruit\/job-postings\/image\//g, `${BE_BASE}/api/recruit/job-postings/image/`)
                    .replace(/<[^>]+>\s*펼치기\s*<\/[^>]+>/gi, "")
                    // 상단 요약줄: "신입/경력 | 정규직 | 대졸 | 지역..." 패턴
                    .replace(/<(?:p|div|span|td)[^>]*>(?:[^<]*\|){2,}[^<]*<\/(?:p|div|span|td)>/gi, "")
                    // 직무 목록줄: 한국어 단어들이 쉼표로만 구성된 줄 (링크·태그 없음)
                    .replace(/<(?:p|div|span)[^>]*>(?:[가-힣\w()\s\/·]+,\s*){4,}[가-힣\w()\s\/·]+<\/(?:p|div|span)>/gi, "")
                }} />
              ) : selected.detailContent ? (
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-350">{selected.detailContent}</div>
              ) : (
                <p className="text-sm text-slate-400">상세 내용을 가져올 수 없습니다.</p>
              )}
            </div>

            {/* Action */}
            <div className={`pt-5 border-t ${isDark ? "border-slate-800" : "border-slate-100"}`}>
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all w-full sm:w-auto"
              >
                {sourceLabel}에서 보기
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 11.5L11.5 2.5M11.5 2.5H5.5M11.5 2.5V8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
