"use client";

import type { JobPosting } from "@/lib/api/recruit/job-posting";
import type { CalendarEvent } from "../_types";
import { toDateKey } from "../_utils";

interface JobCalendarProps {
  calendarMonth: Date;
  moveCalendarMonth: (delta: number) => void;
  popularCategoryFilter: "" | "IT" | "전자";
  setPopularCategoryFilter: (cat: "" | "IT" | "전자") => void;
  popularLoading: boolean;
  popularPostings: JobPosting[];
  visiblePopularPostings: JobPosting[];
  calendarDays: Date[];
  calendarEventsByDate: Map<string, CalendarEvent[]>;
  onSelectPosting: (p: JobPosting) => void;
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
}: JobCalendarProps) {
  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 sm:p-8 max-w-7xl w-full mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-orange-500">
              <path d="M9 1C9 1 13 5 13 9C13 11.2091 11.2091 13 9 13C6.79086 13 5 11.2091 5 9C5 7.5 5.5 6.5 6 5.5C6 5.5 6.5 7 8 7C8 7 7 5 9 1Z" fill="currentColor" />
              <path d="M9 13C9 13 11 14 11 16H7C7 14 9 13 9 13Z" fill="currentColor" opacity="0.5" />
            </svg>
            <h2 className="text-base font-extrabold text-slate-800">채용 일정 캘린더</h2>
            <span className="text-xs text-slate-400 font-medium">· 캐치 인기 공고</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden bg-white text-xs font-bold shrink-0">
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
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white text-xs font-bold shrink-0">
              {(
                [
                  ["", "전체"],
                  ["IT", "IT"],
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
          <div className="grid grid-cols-7 rounded-2xl overflow-hidden border border-slate-200 bg-white">
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                            ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white"
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
