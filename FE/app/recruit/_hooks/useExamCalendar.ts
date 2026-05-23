"use client";

import { useState, useEffect, useMemo } from "react";
import { listExamEvents, type ExamEvent } from "@/lib/api/exams";

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function useExamCalendar() {
  const [examMonth, setExamMonth] = useState(() => new Date());
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const [examLoading, setExamLoading] = useState(true);
  const [examError, setExamError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setExamLoading(true);
      setExamError(null);
      try {
        const from = new Date(examMonth.getFullYear(), examMonth.getMonth(), 1);
        const to = new Date(examMonth.getFullYear(), examMonth.getMonth() + 1, 1);
        const res = await listExamEvents({ from: from.toISOString(), to: to.toISOString() });
        if (!cancelled) setExamEvents(res.items);
      } catch (e) {
        if (!cancelled) setExamError(e instanceof Error ? e.message : "자격증 일정을 불러오지 못했습니다");
      } finally {
        if (!cancelled) setExamLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [examMonth]);

  const examCalendarDays = useMemo(() => buildCalendarDays(examMonth), [examMonth]);

  const examEventsByDate = useMemo(() => {
    const map = new Map<string, ExamEvent[]>();
    for (const event of examEvents) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const dates = [start];
      if (!Number.isNaN(end.getTime()) && toDateKey(end) !== toDateKey(start)) dates.push(end);
      for (const date of dates) {
        if (Number.isNaN(date.getTime())) continue;
        const key = toDateKey(date);
        map.set(key, [...(map.get(key) ?? []), event]);
      }
    }
    return map;
  }, [examEvents]);

  const upcomingExams = useMemo(
    () => [...examEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).slice(0, 4),
    [examEvents],
  );

  const moveExamMonth = (delta: number) => {
    setExamMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return {
    examMonth,
    examEvents,
    examLoading,
    examError,
    examCalendarDays,
    examEventsByDate,
    upcomingExams,
    moveExamMonth,
    toDateKey,
  };
}
