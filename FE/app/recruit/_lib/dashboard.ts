import type { Experience } from "@/lib/api/experiences";
import type { JobRecommendation } from "@/lib/api/recruit/job-posting";
import type { RecruitCalendarEvent } from "../_hooks/useExamCalendar";

export type InfoTab = "jobs" | "letters" | "spec";
export type JobRecommendationWithDetail = JobRecommendation & { detailContent?: string | null; detailHtml?: string | null };

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function scheduleLabel(event: RecruitCalendarEvent) {
  if (event.kind !== "exam") return event.label;
  const phase = event.exam?.phase ? ` · ${event.exam.phase}` : "";
  return `${event.label}${phase}`;
}

export function scheduleTone(event: RecruitCalendarEvent, isDark: boolean) {
  if (event.kind === "job-end") return isDark ? "bg-slate-900 text-white" : "bg-slate-900 text-white";
  if (event.kind === "job-start") return isDark ? "bg-white/10 text-white/80" : "bg-white text-slate-700 ring-1 ring-slate-200";
  if (event.exam?.groupId === "test") return isDark ? "bg-rose-500/20 text-rose-200" : "bg-rose-50 text-rose-600";
  return isDark ? "bg-indigo-500/20 text-indigo-200" : "bg-indigo-50 text-indigo-600";
}

export function deadlineBadge(job: JobRecommendation) {
  const raw = (job.deadline || "").trim();
  if (/d-?day/i.test(raw) || raw.includes("마감")) return { text: raw.replace(/Dday/i, "D-Day"), urgent: true };
  if (/d-\d+/i.test(raw)) return { text: raw.toUpperCase(), urgent: raw.toUpperCase() === "D-0" };
  if (job.endDate) {
    const end = new Date(job.endDate);
    if (!Number.isNaN(end.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000);
      if (diff <= 0) return { text: "D-Day", urgent: true };
      return { text: `D-${diff}`, urgent: diff <= 3 };
    }
  }
  return { text: raw || "상시", urgent: false };
}

export function jobMeta(job: JobRecommendation) {
  return [job.type, job.location].filter(Boolean).join(" · ") || job.jobs || "채용 정보";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractExperienceLine(content: string, labels: string[]) {
  const lines = content.split(/\r?\n/);
  for (const label of labels) {
    const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:：]\\s*(.+)$`);
    const matched = lines.map((line) => line.match(pattern)?.[1]?.trim()).find(Boolean);
    if (matched) return matched;
  }
  return "";
}

export function experienceMeta(exp: Experience) {
  const company = extractExperienceLine(exp.content, ["기업명", "지원 기업", "회사"]);
  const job = extractExperienceLine(exp.content, ["직무", "지원 직무", "직무명"]);
  return [company, job].filter(Boolean).join(" · ") || exp.category || "분류 없음";
}
