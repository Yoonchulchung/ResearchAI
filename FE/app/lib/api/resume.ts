import { API_BASE, apiFetch, getAuthHeaders, readSSE } from "./base";

export interface ResumeSelfIntro {
  id: string;
  question: string;
  answer: string;
  category?: string[];
  refinedTitle?: string | null;
}

export interface ResumeExperience {
  id: string;
  activityType: string;
  organizationName: string;
  startDate?: string | null;
  endDate?: string | null;
  role?: string | null;
  description?: string | null;
}

export interface ResumePrize {
  id: string;
  title: string;
  organization: string;
  issuedDate?: string | null;
  description?: string | null;
}

export interface ResumeTraining {
  id: string;
  title: string;
  institution: string;
  startDate?: string | null;
  endDate?: string | null;
  hours?: string | null;
  description?: string | null;
}

export interface ResumeTarget {
  id: string;
  companyName: string;
  jobTitle: string;
  appliedAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  jd: string;
  interviewScript?: string | null;
  selfIntroductions: ResumeSelfIntro[];
  experiences?: ResumeExperience[];
  prizes?: ResumePrize[];
  trainings?: ResumeTraining[];
}

export interface ResumeProfile {
  resumeTargets: ResumeTarget[];
}

export async function getResume(ids?: string | string[]): Promise<ResumeProfile | null> {
  const idList = Array.isArray(ids) ? ids : ids ? [ids] : [];
  const query = idList.length > 0
    ? `?ids=${encodeURIComponent(idList.join(","))}`
    : "";
  const res = await apiFetch<{ resume: ResumeTarget[] } | null>(`/resume${query}`);
  if (!res) return null;
  return { resumeTargets: res.resume ?? [] };
}

export async function getDeletedResumes(): Promise<ResumeProfile | null> {
  const res = await apiFetch<{ resume: ResumeTarget[] } | null>("/resume?deleted=true");
  if (!res) return null;
  return { resumeTargets: res.resume ?? [] };
}

export async function saveResume(
  profile: ResumeProfile,
  options: { replaceAll?: boolean } = {},
): Promise<ResumeProfile> {
  const res = await apiFetch<{ resume: ResumeTarget[] }>("/resume", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume: profile.resumeTargets ?? [],
      replaceAll: options.replaceAll ?? true,
    }),
  });
  return { resumeTargets: res.resume ?? [] };
}

export async function deleteResume(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/resume/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function restoreResume(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/resume/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export async function permanentlyDeleteResume(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/resume/${encodeURIComponent(id)}/permanent`, { method: "DELETE" });
}

export async function fetchResumePdf(id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/resume/${encodeURIComponent(id)}/pdf`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("이력서 PDF 생성에 실패했습니다.");
  return res.blob();
}

export async function updateResumeInterviewScript(
  resumeId: string,
  interviewScript: string,
): Promise<{ interviewScript: string }> {
  return apiFetch<{ interviewScript: string }>(
    `/resume/${encodeURIComponent(resumeId)}/interview-script`,
    {
      method: "PATCH",
      body: JSON.stringify({ interviewScript }),
    },
  );
}

export interface ResumeVersionSummary {
  id: string;
  resumeId: string;
  title: string | null;
  companyName: string;
  jobTitle: string;
  appliedAt: string;
  createdAt: string;
}

export interface ResumeVersionDetail {
  version: ResumeVersionSummary;
  target: ResumeTarget;
}

export async function getResumeVersions(resumeId: string): Promise<ResumeVersionSummary[]> {
  const res = await apiFetch<{ items: ResumeVersionSummary[] }>(
    `/resume/${encodeURIComponent(resumeId)}/versions`,
  );
  return res.items ?? [];
}

export async function getResumeVersion(resumeId: string, versionId: string): Promise<ResumeVersionDetail> {
  return apiFetch<ResumeVersionDetail>(
    `/resume/${encodeURIComponent(resumeId)}/versions/${encodeURIComponent(versionId)}`,
  );
}

export async function restoreResumeVersion(resumeId: string, versionId: string): Promise<ResumeProfile> {
  const res = await apiFetch<{ resume: ResumeTarget[] }>(
    `/resume/${encodeURIComponent(resumeId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: "POST" },
  );
  return { resumeTargets: res.resume ?? [] };
}

export async function deleteResumeVersion(resumeId: string, versionId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/resume/${encodeURIComponent(resumeId)}/versions/${encodeURIComponent(versionId)}`,
    { method: "DELETE" },
  );
}

export interface ResumeSearchCoverLetterItem {
  type: "coverLetter";
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  question: string;
  answer: string;
}

export interface ResumeSearchExperienceItem {
  type: "experience";
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  activityType: string;
  organizationName: string;
  startDate: string | null;
  endDate: string | null;
  role: string | null;
  description: string | null;
}

export interface ResumeSearchPrizeItem {
  type: "prize";
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  title: string;
  organization: string;
  issuedDate: string | null;
  description: string | null;
}

export interface ResumeSearchTrainingItem {
  type: "training";
  id: string;
  resumeId: string;
  companyName: string;
  jobTitle: string;
  title: string;
  institution: string;
  startDate: string | null;
  endDate: string | null;
  hours: string | null;
  description: string | null;
}

export type ResumeSearchItem = ResumeSearchCoverLetterItem | ResumeSearchExperienceItem | ResumeSearchPrizeItem | ResumeSearchTrainingItem;

export async function searchResume(q: string): Promise<ResumeSearchItem[]> {
  const res = await apiFetch<{ items: ResumeSearchItem[] }>(`/resume/search?q=${encodeURIComponent(q)}`);
  return res?.items ?? [];
}

export type ResumeCategoryEvent =
  | { type: "log"; message: string }
  | { type: "done"; payload?: { total: number; updated: Array<{ id: string; resumeId: string; category: string[] }> } }
  | { type: "error"; message: string };

export async function enqueueResumeCoverLetterCategories(request: {
  resumeIds?: string[];
  coverLetterIds?: string[];
  onlyEmpty?: boolean;
  limit?: number;
  model?: string;
}): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>("/queue/resume/cover-letter-categories", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function streamResumeCoverLetterCategories(
  jobId: string,
  onEvent: (event: ResumeCategoryEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/resume/cover-letter-categories/${jobId}/stream`, {
    headers: getAuthHeaders(),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("자기소개서 카테고리 분류 스트림 연결에 실패했습니다.");
  await readSSE<ResumeCategoryEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done" || event.type === "error") return true;
  });
}

export type ResumeRefinedTitleEvent =
  | { type: "log"; message: string }
  | { type: "done"; payload?: { total: number; updated: Array<{ id: string; resumeId: string; refinedTitle: string }> } }
  | { type: "error"; message: string };

export async function enqueueResumeCoverLetterRefinedTitles(request: {
  resumeIds?: string[];
  coverLetterIds?: string[];
  onlyEmpty?: boolean;
  limit?: number;
  model?: string;
}): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>("/queue/resume/cover-letter-refined-titles", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function streamResumeCoverLetterRefinedTitles(
  jobId: string,
  onEvent: (event: ResumeRefinedTitleEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/queue/resume/cover-letter-refined-titles/${jobId}/stream`, {
    headers: getAuthHeaders(),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("자기소개서 제목 재작성 스트림 연결에 실패했습니다.");
  await readSSE<ResumeRefinedTitleEvent>(res, (event) => {
    onEvent(event);
    if (event.type === "done" || event.type === "error") return true;
  });
}

// ── AI 평가 저장/조회 ──────────────────────────────────────────────────────

export interface ResumeAiEval {
  id: string;
  resumeId: string;
  subjectKey: string;
  type: string;
  result: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export const getResumeAiEvals = (resumeId: string) =>
  apiFetch<ResumeAiEval[]>(`/resume/${encodeURIComponent(resumeId)}/ai-evals`);

export const upsertResumeAiEval = (
  resumeId: string,
  data: { subjectKey: string; type: string; result: string; model?: string },
) =>
  apiFetch<ResumeAiEval>(`/resume/${encodeURIComponent(resumeId)}/ai-evals`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deleteResumeAiEval = (id: string) =>
  apiFetch<{ ok: boolean }>(`/resume/ai-evals/${encodeURIComponent(id)}`, { method: "DELETE" });
