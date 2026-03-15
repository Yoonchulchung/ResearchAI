"use client";

import { useEffect, useRef, useState } from "react";
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

interface Popup {
  day: number;
  sessions: Session[];
  anchorRect: DOMRect;
}

export function CalendarSection() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sessionMap, setSessionMap] = useState<Map<string, Session[]>>(new Map());
  const [popup, setPopup] = useState<Popup | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!popup) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-calendar-popup]") &&
          !(e.target as Element).closest("[data-calendar-day]")) {
        setPopup(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [popup]);

  const weeks = buildCalendar(year, month);

  const prevMonth = () => {
    setPopup(null);
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    setPopup(null);
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const getSessionsForDay = (day: number) => {
    const key = `${year}-${month}-${day}`;
    return sessionMap.get(key) ?? [];
  };

  const handleDayClick = (day: number, sessions: Session[], e: React.MouseEvent<HTMLButtonElement>) => {
    if (sessions.length === 0) return;
    if (popup?.day === day) { setPopup(null); return; }
    setPopup({ day, sessions, anchorRect: e.currentTarget.getBoundingClientRect() });
  };

  // 팝업 위치 계산 (카드 기준 상대 좌표)
  const popupStyle = (() => {
    if (!popup || !cardRef.current) return {};
    const cardRect = cardRef.current.getBoundingClientRect();
    const top = popup.anchorRect.bottom - cardRect.top + 4;
    let left = popup.anchorRect.left - cardRect.left;
    // 우측 넘침 방지
    const popupWidth = 220;
    if (left + popupWidth > cardRect.width) left = cardRect.width - popupWidth - 4;
    if (left < 0) left = 4;
    return { top, left };
  })();

  return (
    <div ref={cardRef} className="bg-white rounded-2xl border border-slate-200 p-5 relative">
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
              const sessions = getSessionsForDay(day);
              const hasSessions = sessions.length > 0;
              const today_ = isToday(day);
              const isOpen = popup?.day === day;
              return (
                <button
                  key={di}
                  data-calendar-day
                  onClick={(e) => handleDayClick(day, sessions, e)}
                  disabled={!hasSessions}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-[11px] font-medium transition-colors ${
                    today_
                      ? "bg-indigo-600 text-white"
                      : isOpen
                      ? "bg-indigo-200 text-indigo-800"
                      : hasSessions
                      ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                      : "text-slate-600 hover:bg-slate-50 cursor-default"
                  } ${di === 0 && !today_ ? "text-red-400" : di === 6 && !today_ ? "text-blue-400" : ""}`}
                >
                  {day}
                  {hasSessions && (
                    <span className={`w-1 h-1 rounded-full mt-0.5 ${today_ ? "bg-indigo-200" : "bg-indigo-400"}`} />
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

      {/* Day popup */}
      {popup && (
        <div
          data-calendar-popup
          className="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-2 w-56"
          style={popupStyle}
        >
          <p className="text-[10px] font-semibold text-slate-400 px-3 pb-1.5 border-b border-slate-100">
            {month + 1}월 {popup.day}일 검색 기록
          </p>
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {popup.sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => { setPopup(null); router.push(`/sessions/${s.id}`); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 transition-colors group"
                >
                  <p className="text-xs text-slate-700 group-hover:text-indigo-700 leading-snug line-clamp-2">
                    {s.topic ?? "제목 없음"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(s.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
