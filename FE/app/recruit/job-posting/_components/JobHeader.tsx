"use client";

import { useRouter } from "next/navigation";
import type { JobPosting, JobScrapingStatus } from "@/lib/api/recruit/job-posting";
import { SOURCE_LABELS } from "../_constants";

interface JobHeaderProps {
  total: number;
  selected: JobPosting | null;
  clearSelected: () => void;
  status: JobScrapingStatus | null;
  scrapeLoading: boolean;
  scrapeSource: "linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all";
  setScrapeSource: (src: "linkareer" | "jobkorea" | "catch" | "jobplanet" | "jobda" | "all") => void;
  linkareerJobType: "INTERN" | "RECRUIT";
  setLinkareerJobType: (jt: "INTERN" | "RECRUIT") => void;
  handleStart: () => void;
  handleStop: () => void;
  isHeaderHidden: boolean;
}

export function JobHeader({
  total,
  selected,
  clearSelected,
  status,
  scrapeLoading,
  scrapeSource,
  setScrapeSource,
  linkareerJobType,
  setLinkareerJobType,
  handleStart,
  handleStop,
  isHeaderHidden,
}: JobHeaderProps) {
  const router = useRouter();

  return (
    <div
      className={`shrink-0 flex flex-col px-4 sm:px-6 sm:py-3 bg-white border-b border-slate-200/80 shadow-sm z-10 transition-all duration-200 ease-out overflow-hidden dark:bg-slate-900/80 dark:border-slate-800 ${
        isHeaderHidden
          ? "max-md:max-h-0 max-md:py-0 max-md:opacity-0 max-md:-translate-y-2 max-md:pointer-events-none max-md:border-b-0"
          : "max-md:max-h-28 max-md:py-3 max-md:opacity-100 max-md:translate-y-0"
      }`}
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (selected) {
              clearSelected();
              return;
            }
            router.back();
          }}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors shrink-0 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">돌아가기</span>
        </button>
        <div className="w-px h-4 bg-slate-200 mx-1 shrink-0 dark:bg-slate-800" />
        <span className="text-base font-bold text-slate-800 tracking-tight shrink-0 dark:text-slate-100">채용 공고</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-500 shrink-0 dark:bg-slate-800 dark:text-slate-400">
          {total.toLocaleString()}건
        </span>
        <div className="flex-1" />
        {status?.running ? (
          <button
            onClick={handleStop}
            disabled={scrapeLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all disabled:opacity-50 bg-white text-red-600 border-red-200 hover:bg-red-50 shrink-0 dark:bg-slate-800 dark:text-red-400 dark:border-red-950/50 dark:hover:bg-red-950/20"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />
            </svg>
            <span className="hidden sm:inline">수집 중단</span>
            <span className="sm:hidden">중단</span>
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={scrapeLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all disabled:opacity-50 bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm shrink-0 dark:bg-indigo-600 dark:border-indigo-600 dark:hover:bg-indigo-700"
          >
            {scrapeLoading ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 1.5L9.5 6L2.5 10.5V1.5Z" fill="currentColor" />
              </svg>
            )}
            크롤링 시작
          </button>
        )}
      </div>

      {/* Controls row */}
      {status?.running ? (
        <div className="flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-600 font-medium border border-emerald-100 w-fit dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          수집 중 {status.totalCollected.toLocaleString()}건 · p.{status.currentPage}
        </div>
      ) : (
        <div className="hidden md:flex items-center gap-2 mt-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {scrapeSource === "linkareer" && (
            <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-semibold bg-white shrink-0 dark:border-slate-800 dark:bg-slate-900">
              {(["INTERN", "RECRUIT"] as const).map((jt) => (
                <button
                  key={jt}
                  onClick={() => setLinkareerJobType(jt)}
                  className={`px-2.5 py-1 transition-colors ${
                    linkareerJobType === jt
                      ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-850"
                  }`}
                >
                  {jt === "INTERN" ? "인턴" : "신입공채"}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-semibold bg-white shrink-0 dark:border-slate-800 dark:bg-slate-900">
            {(["all", "linkareer", "jobkorea", "catch", "jobplanet", "jobda"] as const).map((src) => (
              <button
                key={src}
                onClick={() => setScrapeSource(src)}
                className={`px-2.5 py-1 transition-colors ${
                  scrapeSource === src
                    ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-850"
                }`}
              >
                {src === "all" ? "전체" : SOURCE_LABELS[src]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
