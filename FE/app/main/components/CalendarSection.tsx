"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessions } from "@/lib/api";
import { Session } from "@/types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function buildCalendar(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let day = 1 - firstDay;
  while (day <= daysInMonth) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(day >= 1 && day <= daysInMonth ? day : null);
      day++;
    }
    weeks.push(week);
  }
  return weeks;
}

export function CalendarSection() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sessionMap, setSessionMap] = useState<Map<string, Session[]>>(new Map());

  useEffect(() => {
    getSessions()
      .then((sessions) => {
        const map = new Map<string, Session[]>();
        for (const s of sessions) {
          const d = new Date(s.createdAt);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const existing = map.get(key) ?? [];
          map.set(key, [...existing, s]);
        }
        setSessionMap(map);
      })
      .catch(() => {});
  }, []);

  const weeks = buildCalendar(year, month);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const getSessions_ = (day: number) => {
    const key = `${year}-${month}-${day}`;
    return sessionMap.get(key) ?? [];
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-700">캘린더</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 text-xs transition-colors"
          >
            ◀
          </button>
          <span className="text-xs font-semibold text-slate-600 w-16 text-center">
            {year}.{String(month + 1).padStart(2, "0")}
          </span>
          <button
            onClick={nextMonth}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 text-xs transition-colors"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[10px] font-semibold py-1 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((day, di) => {
              if (!day) return <div key={di} />;
              const sessions = getSessions_(day);
              const hasSessions = sessions.length > 0;
              const today_ = isToday(day);
              return (
                <button
                  key={di}
                  onClick={() => {
                    if (sessions.length === 1) router.push(`/sessions/${sessions[0].id}`);
                  }}
                  disabled={sessions.length === 0}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-[11px] font-medium transition-colors group ${
                    today_
                      ? "bg-indigo-600 text-white"
                      : hasSessions
                      ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                      : "text-slate-600 hover:bg-slate-50 cursor-default"
                  } ${di === 0 ? "text-red-400" : di === 6 ? "text-blue-400" : ""} ${
                    today_ ? "text-white" : ""
                  }`}
                >
                  {day}
                  {hasSessions && (
                    <span
                      className={`w-1 h-1 rounded-full mt-0.5 ${
                        today_ ? "bg-indigo-200" : "bg-indigo-400"
                      }`}
                    />
                  )}
                  {sessions.length > 1 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-indigo-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                      {sessions.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
