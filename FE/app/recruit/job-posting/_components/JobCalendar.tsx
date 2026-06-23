"use client";
import type { JobPosting, JobRecommendation } from "@/lib/api/recruit/job-posting";
import type { CalendarEvent } from "../_types";
import { toDateKey, type PopularCategory } from "../_utils";

interface JobCalendarProps {
  calendarMonth: Date;
  moveCalendarMonth: (delta: number) => void;
  popularCategoryFilter: PopularCategory;
  setPopularCategoryFilter: (cat: PopularCategory) => void;
  popularLoading: boolean;
  popularPostings: JobPosting[];
  visiblePopularPostings: JobPosting[];
  calendarDays: Date[];
  calendarEventsByDate: Map<string, CalendarEvent[]>;
  onSelectPosting: (p: JobPosting) => void;
  recommendations?: JobRecommendation[];
  onDeleteRecommendation?: (id: number) => void;
}

export function JobCalendar({
  calendarMonth,
  moveCalendarMonth,
  popularCategoryFilter,
  setPopularCategoryFilter,
  popularLoading,
  popularPostings,
  visiblePopularPostings,
  calendarDays,
  calendarEventsByDate,
  onSelectPosting,
  recommendations = [],
  onDeleteRecommendation,
}: JobCalendarProps) {
  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 sm:p-8 max-w-7xl w-full mx-auto">
        {/* AI 추천 공고 */}
        {recommendations.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-amber-500">
                <path d="M8 1L9.8 5.8L15 6.3L11 9.8L12.2 15L8 12.4L3.8 15L5 9.8L1 6.3L6.2 5.8L8 1Z" fill="currentColor" />
              </svg>
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">AI 추천 공고</h2>
              <span className="text-xs text-slate-400 font-medium">· 상세 수집 기반 맞춤 추천</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none -mx-1 px-1">
              {recommendations.slice(0, 10).map((rec) => (
                <div key={rec.id} className="relative shrink-0 w-60 group">
                  <a
                    href={rec.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white dark:bg-slate-850 dark:border-slate-800/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 p-4 w-full h-full min-h-36"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">{rec.company}</span>
                      <span className="shrink-0 text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200/60 rounded-full px-2 py-0.5 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30">
                        {rec.score}% 매칭
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">{rec.title}</p>
                    {rec.reason && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-450 leading-relaxed line-clamp-2 mt-0.5 px-2 py-1 bg-slate-50 dark:bg-slate-900/60 rounded-md">
                        {rec.reason}
                      </div>
                    )}
                    {rec.deadline && (
                      <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-auto pt-1 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-slate-350 dark:text-slate-650">
                          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M8 4V8H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span>마감 {rec.deadline}</span>
                      </div>
                    )}
                  </a>
                  {onDeleteRecommendation && (
                    <button
                      onClick={(e) => { e.preventDefault(); onDeleteRecommendation(rec.id); }}
                      className="absolute top-2.5 right-2.5 hidden group-hover:flex items-center justify-center w-4.5 h-4.5 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300 text-[10px] font-bold leading-none shadow-sm transition-colors"
                      title="추천 공고 삭제"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-orange-500">
              <path d="M9 1C9 1 13 5 13 9C13 11.2091 11.2091 13 9 13C6.79086 13 5 11.2091 5 9C5 7.5 5.5 6.5 6 5.5C6 5.5 6.5 7 8 7C8 7 7 5 9 1Z" fill="currentColor" />
              <path d="M9 13C9 13 11 14 11 16H7C7 14 9 13 9 13Z" fill="currentColor" opacity="0.5" />
            </svg>
            <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-200">채용 일정 캘린더</h2>
            <span className="text-xs text-slate-400 font-medium">· 캐치 인기 공고</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-slate-200 overflow-hidden bg-white text-xs font-bold shrink-0">
              <button
                onClick={() => moveCalendarMonth(-1)}
                className="px-3 py-1.5 text-slate-500 hover:bg-slate-50 border-r border-slate-200"
                aria-label="이전 달"
              >
                ‹
              </button>
              <span className="min-w-24 px-3 py-1.5 text-center text-slate-800">
                {calendarMonth.getFullYear()}.{String(calendarMonth.getMonth() + 1).padStart(2, "0")}
              </span>
              <button
                onClick={() => moveCalendarMonth(1)}
                className="px-3 py-1.5 text-slate-500 hover:bg-slate-50 border-l border-slate-200"
                aria-label="다음 달"
              >
                ›
              </button>
            </div>
            <div className="flex rounded-md border border-slate-200 overflow-hidden bg-white text-xs font-bold shrink-0">
              {(
                [
                  ["", "전체"],
                  ["IT", "IT"],
                  ["기획", "기획"],
                  ["전자", "전자"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPopularCategoryFilter(val)}
                  className={`px-3 py-1.5 transition-colors ${
                    popularCategoryFilter === val ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {popularLoading ? (
          <div className="grid grid-cols-7 rounded-md overflow-hidden border border-slate-200 bg-white">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-32 border-r border-b border-slate-100 bg-slate-50/60 animate-pulse" />
            ))}
          </div>
        ) : popularPostings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <p className="text-sm font-medium">인기 공고를 불러올 수 없습니다</p>
          </div>
        ) : visiblePopularPostings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
            <p className="text-sm font-medium">{popularCategoryFilter} 카테고리 인기 공고가 없습니다</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <div key={day} className="px-3 py-2 text-center text-xs font-bold text-slate-500 border-r border-slate-200 last:border-r-0">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const key = toDateKey(day);
                const events = calendarEventsByDate.get(key) ?? [];
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isToday = key === todayKey;
                const visibleEvents = events.slice(0, 7);

                return (
                  <div
                    key={key}
                    className={`min-h-36 p-2.5 border-r border-b border-slate-100 last:border-r-0 ${isCurrentMonth ? "bg-white" : "bg-slate-50/70"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-sm font-bold ${
                          isToday
                            ? "inline-flex items-center justify-center w-6 h-6 rounded-sm bg-indigo-600 text-white"
                            : isCurrentMonth
                              ? "text-slate-700"
                              : "text-slate-300"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {visibleEvents.map((event) => (
                        <button
                          key={event.key}
                          onClick={() => onSelectPosting(event.posting)}
                          title={`${event.posting.company} · ${event.posting.title}`}
                          className="w-full min-w-0 flex items-center gap-1.5 text-left rounded-md px-1 py-0.5 hover:bg-indigo-50 transition-colors group"
                        >
                          <span
                            className={`shrink-0 text-[10px] leading-4 px-1 rounded border font-extrabold ${
                              event.kind === "end" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"
                            }`}
                          >
                            {event.kind === "end" ? "마감" : "시작"}
                          </span>
                          <span className={`truncate text-xs font-bold ${isCurrentMonth ? "text-slate-700 group-hover:text-indigo-700" : "text-slate-400"}`}>
                            {event.posting.company}
                          </span>
                          {event.posting.favorite && (
                            <span className="shrink-0 text-amber-500" aria-label="즐겨찾기">
                              ★
                            </span>
                          )}
                        </button>
                      ))}
                      {events.length > visibleEvents.length && (
                        <span className="block px-1 text-[11px] font-semibold text-slate-400">+{events.length - visibleEvents.length}개 더 있음</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
