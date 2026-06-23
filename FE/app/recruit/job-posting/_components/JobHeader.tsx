"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobPosting, JobScrapingStatus, CollectDetailStatus, CollectDetailConfig, JobkoreaCompanyType } from "@/lib/api/recruit/job-posting";
import { CollectSettingsModal } from "./CollectSettingsModal";
import { ScrapeSettingsModal } from "./ScrapeSettingsModal";
import { ScrapeGaugeBar } from "@/recruit/_components/ScrapeGaugeBar";

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
  jobkoreaCompanyTypes: JobkoreaCompanyType[];
  setJobkoreaCompanyTypes: (types: JobkoreaCompanyType[]) => void;
  handleStart: () => void;
  handleStop: () => void;
  isHeaderHidden: boolean;
  collectStatus: CollectDetailStatus | null;
  collectLoading: boolean;
  collectConfig: CollectDetailConfig;
  setCollectConfig: (config: CollectDetailConfig) => void;
  handleCollectStart: () => void;
  handleCollectStop: () => void;
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
  jobkoreaCompanyTypes,
  setJobkoreaCompanyTypes,
  handleStart,
  handleStop,
  isHeaderHidden,
  collectStatus,
  collectLoading,
  collectConfig,
  setCollectConfig,
  handleCollectStart,
  handleCollectStop,
}: JobHeaderProps) {
  const router = useRouter();
  const [scrapeSettingsOpen, setScrapeSettingsOpen] = useState(false);
  const [collectSettingsOpen, setCollectSettingsOpen] = useState(false);

  return (
    <div
      className={`shrink-0 flex flex-col px-4 sm:px-6 sm:py-3 bg-white border-b border-slate-200/80 z-10 transition-all duration-200 ease-out overflow-hidden dark:bg-slate-900/80 dark:border-slate-800 ${
        isHeaderHidden
          ? "max-md:max-h-0 max-md:py-0 max-md:opacity-0 max-md:-translate-y-2 max-md:pointer-events-none max-md:border-b-0"
          : "max-md:max-h-28 max-md:py-3 max-md:opacity-100 max-md:translate-y-0"
      }`}
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (selected) { clearSelected(); return; }
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
        <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-xs font-semibold text-slate-500 shrink-0 dark:bg-slate-800 dark:text-slate-400">
          {total.toLocaleString()}건
        </span>
        <div className="flex-1" />

        {/* AI 상세 수집 버튼 */}
        {collectStatus?.running ? (
          <button
            onClick={handleCollectStop}
            disabled={collectLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all disabled:opacity-50 bg-white text-amber-600 border-amber-200 hover:bg-amber-50 shrink-0 mr-1.5 dark:bg-slate-800 dark:text-amber-400 dark:border-amber-900/50"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />
            </svg>
            <span className="hidden sm:inline">
              AI 수집 중 {collectStatus.processed}/{collectStatus.total}
            </span>
            <span className="sm:hidden">중단</span>
          </button>
        ) : (
          <div className="flex items-center shrink-0 mr-1.5">
            <button
              onClick={() => setCollectSettingsOpen(true)}
              disabled={collectLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-l-md border transition-all disabled:opacity-50 bg-amber-500 text-white border-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:border-amber-600 dark:hover:bg-amber-700"
            >
              {collectLoading ? (
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              )}
              <span className="hidden sm:inline">AI 상세 수집</span>
              <span className="sm:hidden">AI</span>
            </button>
            <button
              onClick={() => setCollectSettingsOpen(true)}
              disabled={collectLoading}
              title="AI 수집 설정"
              className="flex items-center justify-center px-2 py-1.5 text-xs font-semibold rounded-r-md border-y border-r transition-all disabled:opacity-50 bg-amber-600 text-white border-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:border-amber-700 dark:hover:bg-amber-800"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 10.5A2.5 2.5 0 1 0 8 5.5a2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M2.93 13.07l1.06-1.06M12.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <CollectSettingsModal
          open={collectSettingsOpen}
          config={collectConfig}
          onChange={setCollectConfig}
          onClose={() => setCollectSettingsOpen(false)}
          onStart={handleCollectStart}
          collectLoading={collectLoading}
        />

        {/* 크롤링 버튼 */}
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
          <div className="flex shrink-0">
            <button
              onClick={handleStart}
              disabled={scrapeLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-l-md border transition-all disabled:opacity-50 bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:border-indigo-600 dark:hover:bg-indigo-700"
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
            <button
              onClick={() => setScrapeSettingsOpen(true)}
              disabled={scrapeLoading}
              title="크롤링 설정"
              className="flex items-center justify-center px-2 py-1.5 text-xs font-semibold rounded-r-md border-y border-r transition-all disabled:opacity-50 bg-indigo-700 text-white border-indigo-700 hover:bg-indigo-800 dark:bg-indigo-700 dark:border-indigo-700 dark:hover:bg-indigo-800"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 10.5A2.5 2.5 0 1 0 8 5.5a2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M2.93 13.07l1.06-1.06M12.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <ScrapeSettingsModal
          open={scrapeSettingsOpen}
          onClose={() => setScrapeSettingsOpen(false)}
          scrapeSource={scrapeSource}
          setScrapeSource={setScrapeSource}
          linkareerJobType={linkareerJobType}
          setLinkareerJobType={setLinkareerJobType}
          jobkoreaCompanyTypes={jobkoreaCompanyTypes}
          setJobkoreaCompanyTypes={setJobkoreaCompanyTypes}
          onStart={handleStart}
          scrapeLoading={scrapeLoading}
        />
      </div>

      {/* 수집 진행 상태 게이지 */}
      {(status?.running || collectStatus?.running) && (
        <div className="flex flex-col gap-1.5 mt-2">
          {status?.running && (
            <ScrapeGaugeBar
              running
              label={`크롤링 중 · p.${status.currentPage}`}
              current={status.totalCollected}
            />
          )}
          {collectStatus?.running && (
            <ScrapeGaugeBar
              running
              label="AI 상세 수집 중"
              current={collectStatus.processed}
              total={collectStatus.total}
            />
          )}
        </div>
      )}
    </div>
  );
}
