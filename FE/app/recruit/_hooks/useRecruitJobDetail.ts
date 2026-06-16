import { useState } from "react";
import {
  fetchJobPostingDetail,
  setJobPostingApplied,
} from "@/lib/api/recruit/job-posting";
import type { JobRecommendationWithDetail } from "../_lib/dashboard";
import type { RecruitCalendarEvent } from "./useExamCalendar";

interface SelectedDateEvents {
  date: string;
  events: RecruitCalendarEvent[];
}

export function useRecruitJobDetail() {
  const [selectedJobEvent, setSelectedJobEvent] = useState<RecruitCalendarEvent | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<JobRecommendationWithDetail | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [jobDetailError, setJobDetailError] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<SelectedDateEvents | null>(null);

  const closeJobDetail = () => {
    setSelectedJobEvent(null);
    setSelectedJobDetail(null);
    setJobDetailError(null);
    setJobDetailLoading(false);
  };

  const handleSetApplied = async (job: JobRecommendationWithDetail, appliedAt: string | null) => {
    setSelectedJobDetail((prev) => prev ? { ...prev, appliedAt } : prev);
    try {
      await setJobPostingApplied(job.jobPostingId, appliedAt);
    } catch {
      setSelectedJobDetail((prev) => prev ? { ...prev, appliedAt: job.appliedAt } : prev);
    }
  };

  const openJobDetail = async (event: RecruitCalendarEvent) => {
    if (!event.job) return;

    setSelectedDateEvents(null);
    setSelectedJobEvent(event);
    setSelectedJobDetail(event.job);
    setJobDetailError(null);

    setJobDetailLoading(true);
    try {
      const detail = await fetchJobPostingDetail(
        event.job.jobPostingId,
        event.job.url,
        event.job.source ?? "linkareer",
      );
      setSelectedJobDetail({ ...event.job, ...detail });
    } catch (error) {
      setJobDetailError(error instanceof Error ? error.message : "공고 상세 정보를 불러오지 못했습니다");
    } finally {
      setJobDetailLoading(false);
    }
  };

  const openDateEvents = (date: string, events: RecruitCalendarEvent[]) => {
    setSelectedDateEvents({ date, events });
  };

  return {
    closeJobDetail,
    handleSetApplied,
    jobDetailError,
    jobDetailLoading,
    openDateEvents,
    openJobDetail,
    selectedDateEvents,
    selectedJobDetail,
    selectedJobEvent,
    setSelectedDateEvents,
  };
}
