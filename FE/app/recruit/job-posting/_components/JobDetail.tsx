"use client";

import { useState, useRef, useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { JobPosting } from "@/lib/api/recruit/job-posting";
import { enqueueWriteAssist, streamWriteAssist } from "@/lib/api/ai";
import { getDdayLabel, normalizeType } from "../_utils";
import { FavoriteIcon } from "./FavoriteIcon";
import { PROSE_CLASS } from "../../_constants";

const DEFAULT_MODEL = "claude-sonnet-4-6";

type AiMode = "analysis" | "interview" | null;

interface JobDetailProps {
  selected: JobPosting;
  detailLoading: boolean;
  onToggleFavorite: (p: JobPosting, e?: MouseEvent<HTMLElement>) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function JobDetail({ selected, detailLoading, onToggleFavorite, onScroll }: JobDetailProps) {
  const router = useRouter();
  const [aiMode, setAiMode] = useState<AiMode>(null);
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedDday = getDdayLabel(selected);

  const getPostingContent = () => {
    const parts = [
      `회사: ${selected.company}`,
      `직무: ${selected.title}`,
      selected.type ? `고용형태: ${normalizeType(selected.type)}` : null,
      selected.location ? `근무지: ${selected.location}` : null,
      selected.jobs ? `모집직무: ${selected.jobs}` : null,
      selected.companyType ? `기업형태: ${selected.companyType}` : null,
      selected.deadline ? `마감: ${selected.deadline}` : null,
      selected.detailContent ? `\n상세내용:\n${selected.detailContent}` : null,
    ];
    return parts.filter(Boolean).join("\n");
  };

  const runAi = useCallback(
    async (mode: AiMode) => {
      if (!mode) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setAiMode(mode);
      setAiResult("");
      setAiLoading(true);

      const content = getPostingContent();

      const instruction =
        mode === "analysis"
          ? `다음 채용 공고를 분석해서 아래 형식으로 답변해주세요.\n\n**핵심 자격 요건**\n- ...\n\n**우대 사항**\n- ...\n\n**직무 핵심**\n- ...\n\n**숨겨진 요구사항**\n공고에 명시되지 않았지만 맥락상 예상되는 사항을 분석해주세요.\n\n**지원 전략**\n이 공고에 합격하기 위한 핵심 전략을 제시해주세요.\n\n채용 공고:\n${content}`
          : `다음 채용 공고를 바탕으로 실제 면접에서 나올 수 있는 예상 질문 10개를 생성해주세요.\n\n**기술 면접 질문** (5개)\n각 질문마다 출제 의도와 핵심 답변 방향을 함께 제시해주세요.\n\n**인성/행동 면접 질문** (3개)\nSTAR 기법으로 답변할 수 있는 질문과 의도를 제시해주세요.\n\n**기업/산업 관련 질문** (2개)\n해당 기업과 산업에 특화된 질문과 답변 포인트를 제시해주세요.\n\n채용 공고:\n${content}`;

      try {
        const { jobId } = await enqueueWriteAssist("", instruction, DEFAULT_MODEL);
        await streamWriteAssist(
          jobId,
          (event) => {
            if (event.type === "chunk" && event.text) {
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
      }
    },
    [selected],
  );

  const handleCompanyAnalysis = () => {
    router.push(`/company-analysis?company=${encodeURIComponent(selected.company)}`);
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
            : "링커리어";

  return (
    <div onScroll={onScroll} className="flex-1 overflow-y-auto bg-[#F8F9FA] flex flex-col">
      <div className="p-0 sm:p-8 sm:max-w-3xl w-full mx-auto">
        <div className="bg-white sm:rounded-2xl sm:border sm:border-slate-200/80 sm:shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-8 border-b border-slate-100">
            <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                {selected.type && (
                  <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {normalizeType(selected.type)}
                  </span>
                )}
                {selectedDday && (
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                      selectedDday === "마감"
                        ? "bg-slate-50 text-slate-500 border-slate-200"
                        : selectedDday === "D-Day"
                          ? "bg-red-50 text-red-600 border-red-200"
                          : "bg-amber-50 text-amber-600 border-amber-200"
                    }`}
                  >
                    {selectedDday}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => onToggleFavorite(selected, e)}
                aria-label={selected.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  selected.favorite
                    ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                    : "bg-white border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-200 hover:bg-amber-50"
                }`}
              >
                <FavoriteIcon active={!!selected.favorite} />
                {selected.favorite ? "저장됨" : "저장"}
              </button>
            </div>
            <p className="text-sm font-bold text-slate-500 mb-2 tracking-wide">{selected.company}</p>
            <h1 className="text-[26px] sm:text-3xl font-extrabold leading-tight mb-4 sm:mb-5 text-slate-900 tracking-tight">
              {selected.title}
            </h1>

            <div className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-2 text-[15px] font-medium text-slate-600">
              {selected.location && (
                <span className="flex items-center gap-1.5">
                  <svg className="text-slate-400" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5c-3.3 0-6 2.7-6 6 0 3.8 6 7.5 6 7.5s6-3.7 6-7.5c0-3.3-2.7-6-6-6zm0 8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor" />
                  </svg>
                  {selected.location}
                </span>
              )}
              {selected.startDate || selected.endDate ? (
                <span className="flex items-center gap-1.5">
                  <svg className="text-slate-400" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 1.5v3M11 1.5v3M2 6.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {selected.startDate} ~ {selected.endDate}
                </span>
              ) : (
                selected.deadline && (
                  <span className="flex items-center gap-1.5">
                    <svg className="text-slate-400" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M5 1.5v3M11 1.5v3M2 6.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {selected.deadline}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="p-4 sm:p-8">
            {/* Info grid */}
            {(selected.companyType || selected.jobs || selected.homepage) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-100">
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
                    <a
                      href={selected.homepage.startsWith("http") ? selected.homepage : `https://${selected.homepage}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline break-all"
                    >
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

            {/* AI Tools */}
            <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">AI 도구</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runAi("analysis")}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all disabled:opacity-50 ${
                    aiMode === "analysis" && (aiLoading || aiResult)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  }`}
                >
                  {aiLoading && aiMode === "analysis" ? (
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                  AI 공고 분석
                </button>
                <button
                  onClick={() => runAi("interview")}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all disabled:opacity-50 ${
                    aiMode === "interview" && (aiLoading || aiResult)
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-violet-600 border-violet-200 hover:bg-violet-50"
                  }`}
                >
                  {aiLoading && aiMode === "interview" ? (
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M10 1H2C1.44772 1 1 1.44772 1 2V8C1 8.55228 1.44772 9 2 9H4L6 11L8 9H10C10.5523 9 11 8.55228 11 8V2C11 1.44772 10.5523 1 10 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  )}
                  면접 예상 질문
                </button>
                <button
                  onClick={handleCompanyAnalysis}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50 transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M4 8L8 4M8 4H5.5M8 4V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  기업 분석하기
                </button>
              </div>

              {/* AI Result */}
              {(aiResult || (aiLoading && aiMode)) && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-500">
                      {aiMode === "analysis" ? "AI 공고 분석 결과" : "면접 예상 질문"}
                    </p>
                    {!aiLoading && aiResult && (
                      <button
                        onClick={() => { setAiMode(null); setAiResult(""); }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        닫기
                      </button>
                    )}
                  </div>
                  {aiLoading && !aiResult ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                      <span className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                      분석 중...
                    </div>
                  ) : (
                    <div
                      className={`${PROSE_CLASS} text-sm`}
                      dangerouslySetInnerHTML={{ __html: aiResult.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^- (.*)/gm, "• $1") }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Detail content */}
            <div className="mb-8 sm:mb-10">
              <p className="text-[15px] font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">상세내용</p>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                  상세 내용을 불러오는 중...
                </div>
              ) : selected.detailHtml ? (
                <div className="job-detail-html text-[15px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: selected.detailHtml }} />
              ) : selected.detailContent ? (
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700 font-medium">{selected.detailContent}</div>
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
                {sourceLabel}에서 공고 보기
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
