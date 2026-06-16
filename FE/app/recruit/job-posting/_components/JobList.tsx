"use client";

import type { MouseEvent } from "react";
import type { JobPosting } from "@/lib/api/recruit/job-posting";
import { normalizeType } from "../_utils";
import { FavoriteIcon } from "./FavoriteIcon";

interface JobListProps {
  items: JobPosting[];
  loading: boolean;
  selected: JobPosting | null;
  search: string;
  externalSearchLoading: boolean;
  externalSearchCount: number;
  onExternalSearch: (keyword: string) => void;
  onSelect: (p: JobPosting) => void;
  onToggleFavorite: (p: JobPosting, e?: MouseEvent<HTMLElement>) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  loaderRef: React.RefObject<HTMLDivElement | null>;
  listItemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

export function JobList({ items, loading, selected, search, externalSearchLoading, externalSearchCount, onExternalSearch, onSelect, onToggleFavorite, onScroll, loaderRef, listItemRefs }: JobListProps) {
  const keyword = search.trim();

  // 외부 검색 중 + 결과 없음 → 풀패널 애니메이션
  if (externalSearchLoading && items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 bg-white dark:bg-slate-900/40">
        {/* 회전 서클 + 돋보기 아이콘 */}
        <div className="relative flex items-center justify-center w-20 h-20">
          <div className="absolute inset-0 rounded-sm border-2 border-indigo-100 dark:border-indigo-900/60" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
          <div className="absolute inset-1 rounded-sm border border-transparent border-t-indigo-300/50 animate-[spin_2s_linear_infinite_reverse]" />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-indigo-500 dark:text-indigo-400">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        {/* 텍스트 */}
        <div className="text-center space-y-1.5">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            &ldquo;{keyword}&rdquo; 검색 중
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            외부 채용 사이트에서 공고를 수집하고 있습니다
          </p>
        </div>

        {/* 수집 카운터 */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-all ${
          externalSearchCount > 0
            ? "bg-indigo-50 dark:bg-indigo-950/50"
            : "bg-slate-50 dark:bg-white/5"
        }`}>
          <span className="w-1.5 h-1.5 rounded-sm bg-indigo-400 animate-pulse" />
          <span className="text-xs font-bold tabular-nums text-indigo-600 dark:text-indigo-300">
            {externalSearchCount > 0 ? `${externalSearchCount}건 수집됨` : "사이트 연결 중..."}
          </span>
        </div>

        {/* 바운스 점 */}
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 rounded-sm bg-indigo-300 dark:bg-indigo-600 animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 결과 있을 때 상단 프로그레스 바 */}
      {externalSearchLoading && items.length > 0 && (
        <div className="shrink-0 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50 flex items-center gap-2.5">
          <div className="relative flex-1 h-1 rounded-sm bg-indigo-100 dark:bg-indigo-900/60 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-sm animate-[indeterminate_1.5s_ease-in-out_infinite]" style={{ width: "40%" }} />
          </div>
          <span className="shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-300 tabular-nums">
            {externalSearchCount > 0 ? `+${externalSearchCount}건 수집 중` : "검색 중..."}
          </span>
        </div>
      )}

      <div onScroll={onScroll} className="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/40">
      {items.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 p-6 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="6" y="6" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
            <path d="M13 16h14M13 22h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium">조회된 공고가 없습니다</p>
          {keyword && (
            <button
              onClick={() => onExternalSearch(keyword)}
              className="px-4 py-2 text-xs font-bold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              &ldquo;{keyword}&rdquo; 외부 사이트에서 검색
            </button>
          )}
        </div>
      )}
      {items.map((p) => (
        <div
          key={p.id}
          ref={(node) => {
            if (node) listItemRefs.current.set(p.id, node);
            else listItemRefs.current.delete(p.id);
          }}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(p)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(p);
            }
          }}
          className={`w-full text-left p-4 border-b transition-all group ${
            selected?.id === p.id
              ? "bg-indigo-50/60 border-indigo-100 shadow-[inset_3px_0_0_0_#4f46e5] dark:bg-indigo-950/30 dark:border-indigo-950/50 dark:shadow-[inset_3px_0_0_0_#6366f1]"
              : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200 dark:bg-slate-800/40 dark:border-slate-800/50 dark:hover:bg-slate-850 dark:hover:border-slate-700"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <p className={`text-xs font-bold truncate ${selected?.id === p.id ? "text-indigo-900 dark:text-indigo-300" : "text-slate-700 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200"}`}>
                  {p.company}
                </p>
                {p.source === "linkareer" && (
                  <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-bold tracking-wide dark:bg-emerald-950/40 dark:text-emerald-400">링커리어</span>
                )}
                {p.source === "jobkorea" && (
                  <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-bold tracking-wide dark:bg-orange-950/40 dark:text-orange-400">잡코리아</span>
                )}
                {p.source === "catch" && (
                  <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-bold tracking-wide dark:bg-sky-950/40 dark:text-sky-400">캐치</span>
                )}
                {p.source === "jobplanet" && (
                  <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-bold tracking-wide dark:bg-violet-950/40 dark:text-violet-400">잡플래닛</span>
                )}
                {p.source === "jobda" && (
                  <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-bold tracking-wide dark:bg-teal-950/40 dark:text-teal-400">잡다</span>
                )}
              </div>
              <p className={`text-[15px] font-semibold line-clamp-2 leading-snug mb-2 ${selected?.id === p.id ? "text-indigo-950 dark:text-indigo-100" : "text-slate-900 dark:text-slate-100"}`}>
                {p.title}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => onToggleFavorite(p, e)}
              aria-label={p.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              className={`shrink-0 p-1.5 rounded-md transition-colors ${
                p.favorite ? "text-amber-500 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50 dark:text-slate-600 dark:hover:text-amber-400"
              }`}
            >
              <FavoriteIcon active={!!p.favorite} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {p.type && (
              <span className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium border border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60">
                {normalizeType(p.type)}
              </span>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {p.location && (
                <span className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1C3 1 1.5 2.5 1.5 4.5C1.5 7 5 9.5 5 9.5C5 9.5 8.5 7 8.5 4.5C8.5 2.5 7 1 5 1ZM5 5.5C4.44772 5.5 4 5.05228 4 4.5C4 3.94772 4.44772 3.5 5 3.5C5.55228 3.5 6 3.94772 6 4.5C6 5.05228 5.55228 5.5 5 5.5Z" fill="currentColor" />
                  </svg>
                  {p.location}
                </span>
              )}
              {p.location && p.deadline && <span className="w-0.5 h-0.5 rounded-sm bg-slate-300 dark:bg-slate-750" />}
              {p.deadline && (
                <span className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="1.5" y="2" width="7" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M3.5 1V2.5M6.5 1V2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {p.deadline}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={loaderRef} className="py-6 flex justify-center">
        {loading && <span className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin block dark:border-indigo-950 dark:border-t-indigo-500" />}
      </div>
      </div>
    </div>
  );
}
