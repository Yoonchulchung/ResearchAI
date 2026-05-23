"use client";

import { useState, useEffect, useMemo } from "react";
import { listExamEvents, type ExamEvent } from "@/lib/api/exams";
import { listJobPostings, type JobPosting } from "@/lib/api/recruit/job-posting";

export type RecruitCalendarEvent = {
  id: string;
  kind: "exam" | "job-start" | "job-end";
  title: string;
  label: string;
  description?: string;
  date: string;
  exam?: ExamEvent;
  job?: JobPosting;
};

export type CalendarJobTypeFilter = "" | "early" | "career";

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function parseScheduleDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  const simple = normalized.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (simple) {
    return new Date(Number(simple[1]), Number(simple[2]) - 1, Number(simple[3]));
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function toJobTypeParam(filter: CalendarJobTypeFilter) {
  if (filter === "early") return "신입,인턴";
  if (filter === "career") return "경력";
  return undefined;
}

export function useExamCalendar(jobTypeFilter: CalendarJobTypeFilter = "") {
  const [examMonth, setExamMonth] = useState(() => new Date());
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const [jobEvents, setJobEvents] = useState<RecruitCalendarEvent[]>([]);
  const [examLoading, setExamLoading] = useState(true);
  const [jobLoading, setJobLoading] = useState(true);
  const [examError, setExamError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setJobLoading(true);
      setJobError(null);
      try {
        const scheduleFrom = toDateKey(new Date(examMonth.getFullYear(), examMonth.getMonth(), 1));
        const scheduleTo = toDateKey(new Date(examMonth.getFullYear(), examMonth.getMonth() + 1, 0));
        const res = await listJobPostings({
          page: 1,
          limit: 1000,
          sort: "deadline",
          category: "IT,전자",
          excludeCompanyType: "중소기업,스타트업",
          type: toJobTypeParam(jobTypeFilter),
          scheduleFrom,
          scheduleTo,
        });
        if (cancelled) return;
        const events: RecruitCalendarEvent[] = [];
        for (const job of res.items) {
          const start = parseScheduleDate(job.startDate);
          const end = parseScheduleDate(job.endDate || job.deadline);
          if (start && isInMonth(start, examMonth)) {
            events.push({
              id: `${job.id}-start`,
              kind: "job-start",
              title: job.company,
              label: "시작",
              description: job.title,
              date: toDateKey(start),
              job,
            });
          }
          if (end && isInMonth(end, examMonth)) {
            events.push({
              id: `${job.id}-end`,
              kind: "job-end",
              title: job.company,
              label: "마감",
              description: job.title,
              date: toDateKey(end),
              job,
            });
          }
        }
        setJobEvents(events);
      } catch (e) {
        if (!cancelled) setJobError(e instanceof Error ? e.message : "채용 일정을 불러오지 못했습니다");
      } finally {
        if (!cancelled) setJobLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [examMonth, jobTypeFilter]);

  const examCalendarDays = useMemo(() => buildCalendarDays(examMonth), [examMonth]);

  const calendarEvents = useMemo<RecruitCalendarEvent[]>(() => {
    const examItems = examEvents.flatMap((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const dates = [start];
      if (!Number.isNaN(end.getTime()) && toDateKey(end) !== toDateKey(start)) dates.push(end);
      return dates
        .filter((date) => !Number.isNaN(date.getTime()))
        .map((date) => ({
          id: `${event.id}-${toDateKey(date)}`,
          kind: "exam" as const,
          title: event.shortTitle || event.title,
          label: event.groupId === "apply" ? "접수" : event.groupId === "test" ? "시험" : event.groupId === "result" ? "발표" : event.groupId,
          description: event.description,
          date: toDateKey(date),
          exam: event,
        }));
    });
    return [...examItems, ...jobEvents].sort((a, b) => a.date.localeCompare(b.date));
  }, [examEvents, jobEvents]);

  const examEventsByDate = useMemo(() => {
    const map = new Map<string, RecruitCalendarEvent[]>();
    for (const event of calendarEvents) {
      const key = event.date;
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [calendarEvents]);

  const upcomingExams = useMemo(
    () => [...calendarEvents].sort((a, b) => a.date.localeCompare(b.date)),
    [calendarEvents],
  );

  const moveExamMonth = (delta: number) => {
    setExamMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return {
    examMonth,
    examEvents,
    examLoading: examLoading || jobLoading,
    examError: examError || jobError,
    examCalendarDays,
    examEventsByDate,
    upcomingExams,
    calendarEvents,
    jobEvents,
    moveExamMonth,
    toDateKey,
  };
}
