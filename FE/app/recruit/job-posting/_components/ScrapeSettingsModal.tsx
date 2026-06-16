"use client";

import { useRef } from "react";
import { SOURCE_LABELS } from "../_constants";
import { JOBKOREA_COMPANY_TYPES, type JobkoreaCompanyType } from "@/lib/api/recruit/job-posting";

const SOURCES = ["all", "linkareer", "jobkorea", "catch", "jobplanet", "jobda"] as const;
type ScrapeSource = (typeof SOURCES)[number];

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

interface Props {
  open: boolean;
  onClose: () => void;
  scrapeSource: ScrapeSource;
  setScrapeSource: (src: ScrapeSource) => void;
  linkareerJobType: "INTERN" | "RECRUIT";
  setLinkareerJobType: (jt: "INTERN" | "RECRUIT") => void;
  jobkoreaCompanyTypes: JobkoreaCompanyType[];
  setJobkoreaCompanyTypes: (types: JobkoreaCompanyType[]) => void;
  onStart: () => void;
  scrapeLoading: boolean;
}

export function ScrapeSettingsModal({
  open,
  onClose,
  scrapeSource,
  setScrapeSource,
  linkareerJobType,
  setLinkareerJobType,
  jobkoreaCompanyTypes,
  setJobkoreaCompanyTypes,
  onStart,
  scrapeLoading,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  if (!open) return null;

  const handleStart = () => { onStart(); onClose(); };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">크롤링 설정</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* 수집 소스 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              수집 소스
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((src) => (
                <button
                  key={src}
                  onClick={() => setScrapeSource(src)}
                  className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition-all ${
                    scrapeSource === src
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                  }`}
                >
                  {src === "all" ? "전체" : SOURCE_LABELS[src]}
                </button>
              ))}
            </div>
          </div>

          {/* 잡코리아 기업 규모 */}
          {scrapeSource === "jobkorea" && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                기업 규모 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {JOBKOREA_COMPANY_TYPES.map((ct) => (
                  <button
                    key={ct}
                    onClick={() => setJobkoreaCompanyTypes(toggleItem(jobkoreaCompanyTypes, ct))}
                    className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition-all ${
                      jobkoreaCompanyTypes.includes(ct)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                    }`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 링커리어 공고 유형 */}
          {scrapeSource === "linkareer" && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                공고 유형
              </label>
              <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-semibold w-fit">
                {(["INTERN", "RECRUIT"] as const).map((jt) => (
                  <button
                    key={jt}
                    onClick={() => setLinkareerJobType(jt)}
                    className={`px-3 py-1.5 transition-colors ${
                      linkareerJobType === jt
                        ? "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {jt === "INTERN" ? "인턴" : "신입공채"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleStart}
            disabled={scrapeLoading}
            className="w-full py-2.5 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {scrapeLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                수집 중...
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 1.5L9.5 6L2.5 10.5V1.5Z" fill="currentColor" />
                </svg>
                크롤링 시작
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
