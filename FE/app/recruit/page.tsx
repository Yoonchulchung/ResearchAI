"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchJobPostingDetail, listJobPostings, type JobPosting } from "@/lib/api/recruit/job-posting";
import { listCoverLetters, type CoverLetter } from "@/lib/api/recruit/cover-letter";
import { listCompanyAnalyses, type CompanyAnalysis } from "@/lib/api/company-analysis";
import { getExperiences, type Experience } from "@/lib/api/experiences";
import { API_BASE, getAuthHeaders } from "@/lib/api/base";
import { useTheme } from "@/contexts/ThemeContext";
import { IconEvaluate, IconSpellcheck } from "./_components/icons";
import { PROSE_CLASS } from "./_constants";
import { useDraftAssist } from "./_hooks/useDraftAssist";
import { useExamCalendar, type CalendarJobTypeFilter, type RecruitCalendarEvent } from "./_hooks/useExamCalendar";

type InfoTab = "jobs" | "letters";
type JobCategoryFilter = "" | "IT" | "전자";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function scheduleLabel(event: RecruitCalendarEvent) {
  if (event.kind !== "exam") return event.label;
  const phase = event.exam?.phase ? ` · ${event.exam.phase}` : "";
  return `${event.label}${phase}`;
}

function scheduleTone(event: RecruitCalendarEvent, isDark: boolean) {
  if (event.kind === "job-end") return isDark ? "bg-slate-900 text-white" : "bg-slate-900 text-white";
  if (event.kind === "job-start") return isDark ? "bg-white/10 text-white/80" : "bg-white text-slate-700 ring-1 ring-slate-200";
  if (event.exam?.groupId === "test") return isDark ? "bg-rose-500/20 text-rose-200" : "bg-rose-50 text-rose-600";
  return isDark ? "bg-indigo-500/20 text-indigo-200" : "bg-indigo-50 text-indigo-600";
}

function deadlineBadge(job: JobPosting) {
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

function jobMeta(job: JobPosting) {
  return [job.type, job.location].filter(Boolean).join(" · ") || job.category || "채용 정보";
}

function analysisMeta(analysis: CompanyAnalysis) {
  return [analysis.industry, analysis.companySize, analysis.corpClass].filter(Boolean).join(" · ") || "기업 분석";
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

function experienceMeta(exp: Experience) {
  const company = extractExperienceLine(exp.content, ["기업명", "지원 기업", "회사"]);
  const job = extractExperienceLine(exp.content, ["직무", "지원 직무", "직무명"]);
  return [company, job].filter(Boolean).join(" · ") || exp.category || "분류 없음";
}

export default function RecruitPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [activeTab, setActiveTab] = useState<InfoTab>("jobs");
  const [jobCategoryFilter, setJobCategoryFilter] = useState<JobCategoryFilter>("");
  const [calendarJobTypeFilter, setCalendarJobTypeFilter] = useState<CalendarJobTypeFilter>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [expLoading, setExpLoading] = useState(true);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [companyAnalyses, setCompanyAnalyses] = useState<CompanyAnalysis[]>([]);
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedJobEvent, setSelectedJobEvent] = useState<RecruitCalendarEvent | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<JobPosting | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [jobDetailError, setJobDetailError] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<{ date: string; events: RecruitCalendarEvent[] } | null>(null);
  const { draft, setDraft, assistMode, assistResult, assistLoading, assistError, runDraftAssist, closeAssist } = useDraftAssist();
  const { examMonth, examLoading, examError, examCalendarDays, examEventsByDate, upcomingExams, calendarEvents, moveExamMonth, toDateKey } = useExamCalendar(calendarJobTypeFilter);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listJobPostings({
          page: 1,
          limit: 5,
          sort: "deadline",
          category: jobCategoryFilter || undefined,
        });
        if (!cancelled) setJobs(result.items);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "채용 정보를 불러오지 못했습니다");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [jobCategoryFilter]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const res = await listCompanyAnalyses();
        if (cancelled) return;
        const recent = [...res].sort((a, b) => {
          const at = new Date(a.updatedAt || a.createdAt).getTime();
          const bt = new Date(b.updatedAt || b.createdAt).getTime();
          return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
        });
        setCompanyAnalyses(recent.slice(0, 10));
      } catch (e) {
        if (!cancelled) setAnalysisError(e instanceof Error ? e.message : "기업 분석을 불러오지 못했습니다");
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getExperiences().then((res) => {
      if (!cancelled) { setExperiences(res); setExpLoading(false); }
    }).catch(() => { if (!cancelled) setExpLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeTab !== "letters" || coverLetters.length > 0 || coverLoading) return;
    let cancelled = false;
    const load = async () => {
      setCoverLoading(true);
      setCoverError(null);
      try {
        const res = await listCoverLetters(1, 10, { sort: "latest" });
        if (cancelled) return;
        setCoverLetters(res.items);
      } catch (e) {
        if (!cancelled) setCoverError(e instanceof Error ? e.message : "자소서를 불러오지 못했습니다");
      } finally {
        if (!cancelled) setCoverLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, coverLetters.length, coverLoading]);

  const topJobs = jobs;
  const filteredCompanyAnalyses = useMemo(() => {
    const query = analysisSearch.trim().toLowerCase();
    if (!query) return companyAnalyses;
    return companyAnalyses.filter((analysis) =>
      [analysis.companyName, analysis.industry, analysis.companySize, analysis.corpClass]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [analysisSearch, companyAnalyses]);
  const visibleCompanyAnalyses = useMemo(() => filteredCompanyAnalyses.slice(0, 10), [filteredCompanyAnalyses]);

  const openCompanyAnalysisSearch = () => {
    const query = analysisSearch.trim();
    router.push(query ? `/company-analysis?company=${encodeURIComponent(query)}` : "/company-analysis");
  };

  const closeJobDetail = () => {
    setSelectedJobEvent(null);
    setSelectedJobDetail(null);
    setJobDetailError(null);
    setJobDetailLoading(false);
  };

  const openJobDetail = async (event: RecruitCalendarEvent) => {
    if (!event.job) return;
    setSelectedDateEvents(null);
    setSelectedJobEvent(event);
    setSelectedJobDetail(event.job);
    setJobDetailError(null);

    if (event.job.detailContent || event.job.detailHtml) return;

    setJobDetailLoading(true);
    try {
      const detail = await fetchJobPostingDetail(event.job.id, event.job.url, event.job.source ?? "linkareer");
      setSelectedJobDetail({ ...event.job, ...detail });
    } catch (e) {
      setJobDetailError(e instanceof Error ? e.message : "공고 상세 정보를 불러오지 못했습니다");
    } finally {
      setJobDetailLoading(false);
    }
  };

  const openDateEvents = (date: string, events: RecruitCalendarEvent[]) => {
    setSelectedDateEvents({ date, events });
  };

  const handlePdfFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/doc-parse/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      const raw = await res.json();
      const data = raw?.isSuccess === true && "result" in raw ? raw.result : raw;
      const draft = {
        docText: data.text ?? "",
        docPages: Array.isArray(data.pages) ? data.pages : [],
        filename: file.name,
        pageCount: data.pageCount ?? 1,
        isReady: true,
        messages: [{
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: data.text
            ? `**${file.name}** 파일이 업로드되었습니다. (${data.pageCount}페이지)\n\n질문하거나 빠른 실행 버튼을 사용해보세요.`
            : `**${file.name}** 파일이 업로드되었습니다.\n\n텍스트를 추출하지 못했습니다. 스캔된 이미지 PDF이거나 암호화된 파일일 수 있습니다.`,
        }],
        selectedModel: "",
        pdfDataUrl: null,
      };
      sessionStorage.setItem("doc-parse-draft", JSON.stringify(draft));
      router.push("/recruit/doc-parse");
    } catch {
      setPdfUploading(false);
    }
  };

  const pageClass = isGlass
    ? "bg-transparent"
    : isDark
      ? "bg-slate-950"
      : "bg-slate-50";
  const boxClass = isGlass
    ? "glass-panel border-white/20"
    : isDark
      ? "border-white/10 bg-slate-900"
      : "border-slate-200 bg-white";
  const subtleBoxClass = isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";
  const canRunAssist = draft.trim().length > 0 && !assistLoading;
  const assistTitle = assistMode === "spellcheck" ? "맞춤법 검사" : "글 평가";

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr]">
          <section className={`flex min-h-[20rem] flex-col overflow-hidden rounded-2xl border p-5 shadow-sm ${boxClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${textSub}`}>01</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"}`}>
                    기업 리서치
                  </span>
                </div>
                <h1 className={`mt-4 text-3xl font-bold tracking-tight ${textMain}`}>기업 분석</h1>
                <p className={`mt-2 text-sm ${textSub}`}>최근 분석한 기업 10개를 바로 확인합니다.</p>
              </div>
              <button
                onClick={() => router.push("/company-analysis")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${isDark ? "text-indigo-300 hover:bg-white/10" : "text-indigo-600 hover:bg-indigo-50"}`}
              >
                상세 페이지
              </button>
            </div>

            <form
              className="mt-5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (filteredCompanyAnalyses.length === 0) openCompanyAnalysisSearch();
              }}
            >
              <div className="relative min-w-0 flex-1">
                <svg className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-white/35" : "text-slate-400"}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={analysisSearch}
                  onChange={(event) => setAnalysisSearch(event.target.value)}
                  placeholder="기업명, 산업, 규모 검색"
                  className={`h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors ${
                    isDark
                      ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50"
                      : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
                  }`}
                />
              </div>
              <button
                type="submit"
                className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  isDark ? "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white" : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {analysisSearch.trim() && filteredCompanyAnalyses.length === 0 ? "상세 검색" : "검색"}
              </button>
            </form>

            <div className="mt-5 flex-1">
              {analysisLoading ? (
                <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>기업 분석을 불러오는 중...</div>
              ) : analysisError ? (
                <div className={`flex h-44 items-center justify-center text-sm ${isDark ? "text-red-300" : "text-red-500"}`}>{analysisError}</div>
              ) : companyAnalyses.length === 0 ? (
                <div className={`flex h-44 flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
                  <span>표시할 기업 분석이 없습니다.</span>
                  <button
                    onClick={() => router.push("/company-analysis")}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    기업 분석 시작
                  </button>
                </div>
              ) : visibleCompanyAnalyses.length === 0 ? (
                <div className={`flex h-44 flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
                  <span>저장된 분석에서 찾지 못했습니다.</span>
                  <button
                    onClick={openCompanyAnalysisSearch}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    상세 페이지에서 검색
                  </button>
                </div>
              ) : (
                <ol className="grid gap-2 sm:grid-cols-2">
                  {visibleCompanyAnalyses.map((analysis, index) => (
                    <li key={analysis.companyKey || analysis.id}>
                      <button
                        onClick={() => router.push(`/company-analysis?company=${encodeURIComponent(analysis.companyName)}`)}
                        className={`grid w-full grid-cols-[2rem_1fr] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
                      >
                        <span className={`text-base font-black tabular-nums ${isDark ? "text-white/35" : "text-slate-400"}`}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className={`block truncate text-sm font-bold ${textMain}`}>{analysis.companyName}</span>
                          <span className={`block truncate text-xs ${textSub}`}>{analysisMeta(analysis)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section className={`flex min-h-[20rem] flex-col overflow-hidden rounded-2xl border shadow-sm ${boxClass}`}>
            <div className="grid grid-cols-2 border-b border-slate-200 dark:border-white/10">
              <button
                onClick={() => setActiveTab("jobs")}
                className={`py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === "jobs"
                    ? isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-950"
                    : isDark ? "text-white/55 hover:bg-white/5 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                채용 공고
              </button>
              <button
                onClick={() => setActiveTab("letters")}
                className={`border-l border-slate-200 py-2.5 text-sm font-semibold transition-colors dark:border-white/10 ${
                  activeTab === "letters"
                    ? isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-950"
                    : isDark ? "text-white/55 hover:bg-white/5 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                자소서
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-5">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-bold sm:text-xl ${textMain}`}>{activeTab === "jobs" ? "채용 정보" : "최근 자소서"}</h2>
                <div className="flex items-center gap-2">
                  {activeTab === "jobs" && (
                    <div className={`flex overflow-hidden rounded-lg border text-xs font-bold ${
                      isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                    }`}>
                      {([["", "전체"], ["IT", "IT"], ["전자", "전자"]] as const).map(([value, label]) => (
                        <button
                          key={label}
                          onClick={() => setJobCategoryFilter(value)}
                          className={`px-2.5 py-1.5 transition-colors ${
                            jobCategoryFilter === value
                              ? "bg-indigo-600 text-white"
                              : isDark ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => router.push(activeTab === "jobs" ? "/recruit/job-posting" : "/recruit/cover-letter")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${isDark ? "text-indigo-300 hover:bg-white/10" : "text-indigo-600 hover:bg-indigo-50"}`}
                  >
                    상세 페이지
                  </button>
                </div>
              </div>

              {activeTab === "jobs" ? (
                <div className="mt-4 flex-1">
                  {loading ? (
                    <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>채용 정보를 불러오는 중...</div>
                  ) : error ? (
                    <div className={`flex h-44 items-center justify-center text-sm ${isDark ? "text-red-300" : "text-red-500"}`}>{error}</div>
                  ) : topJobs.length === 0 ? (
                    <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>표시할 공고가 없습니다.</div>
                  ) : (
                    <ol className="space-y-2">
                      {topJobs.map((job, index) => {
                        const badge = deadlineBadge(job);
                        return (
                          <li key={job.id}>
                            <button
                              onClick={() => router.push(`/recruit/job-posting?job=${encodeURIComponent(job.id)}`)}
                              className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
                            >
                              <span className={`text-base font-black tabular-nums ${isDark ? "text-white/35" : "text-slate-400"}`}>
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="min-w-0">
                                <span className={`block truncate text-sm font-bold ${textMain}`}>{job.company}</span>
                                <span className={`block truncate text-xs ${textSub}`}>{job.title} · {jobMeta(job)}</span>
                              </span>
                              <span className={`rounded-md border px-2 py-1 text-xs font-bold ${
                                badge.urgent
                                  ? "border-rose-200 bg-rose-50 text-rose-600"
                                  : "border-amber-200 bg-amber-50 text-amber-600"
                              }`}>
                                {badge.text}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex-1">
                  {coverLoading ? (
                    <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>최근 자소서를 불러오는 중...</div>
                  ) : coverError ? (
                    <div className={`flex h-44 items-center justify-center text-sm ${isDark ? "text-red-300" : "text-red-500"}`}>{coverError}</div>
                  ) : coverLetters.length === 0 ? (
                    <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>표시할 자소서가 없습니다.</div>
                  ) : (
                    <ol className="space-y-2">
                      {coverLetters.map((letter, index) => (
                        <li key={letter.id}>
                          <button
                            onClick={() => router.push(`/recruit/cover-letter?cover=${encodeURIComponent(letter.id)}`)}
                            className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
                          >
                            <span className={`text-base font-black tabular-nums ${isDark ? "text-white/35" : "text-slate-400"}`}>
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0">
                              <span className={`block truncate text-sm font-bold ${textMain}`}>{letter.company}</span>
                              <span className={`block truncate text-xs ${textSub}`}>{letter.position} · {letter.season}</span>
                            </span>
                            <span className={`rounded-md border px-2 py-1 text-xs font-bold ${
                              isDark ? "border-white/10 text-white/55" : "border-slate-200 text-slate-500"
                            }`}>
                              {letter.source === "catch" ? "캐치" : letter.source === "linkareer" ? "링커리어" : "자소서"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className={`overflow-hidden rounded-2xl border p-5 shadow-sm ${boxClass}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${textSub}`}>02</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"}`}>
                  이력서 · 경험
                </span>
              </div>
              <h2 className={`mt-4 text-3xl font-bold tracking-tight ${textMain}`}>경험 라이브러리</h2>
              <p className={`mt-2 text-sm ${textSub}`}>
                {expLoading ? "불러오는 중..." : `${experiences.length}개의 경험이 저장되어 있습니다.`}
              </p>
            </div>
            <button
              onClick={() => router.push("/recruit/resume")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${isDark ? "text-indigo-300 hover:bg-white/10" : "text-indigo-600 hover:bg-indigo-50"}`}
            >
              이력서 관리
            </button>
          </div>

          <div className="mt-5">
            {expLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`h-10 rounded-lg animate-pulse ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
                ))}
              </div>
            ) : experiences.length === 0 ? (
              <div className={`flex flex-col items-center justify-center gap-3 py-10 text-sm ${textSub}`}>
                <span>저장된 경험이 없습니다.</span>
                <button
                  onClick={() => router.push("/recruit/resume")}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  이력서에서 추가하기
                </button>
              </div>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {experiences.slice(0, 6).map((exp, index) => (
                  <li key={exp.id}>
                    <button
                      onClick={() => router.push("/recruit/resume")}
                      className={`grid w-full grid-cols-[2rem_1fr] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
                    >
                      <span className={`text-base font-black tabular-nums ${isDark ? "text-white/35" : "text-slate-400"}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-sm font-bold ${textMain}`}>{exp.title}</span>
                        <span className={`block truncate text-xs ${textSub}`}>{experienceMeta(exp)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* PDF 업로드 카드 */}
        <section
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handlePdfFile(f); }}
          onClick={() => !pdfUploading && pdfInputRef.current?.click()}
          className={`relative flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all shadow-sm select-none ${
            dragOver
              ? isDark ? "border-indigo-400 bg-indigo-500/10" : "border-indigo-400 bg-indigo-50"
              : isDark ? "border-white/15 hover:border-indigo-400/50 hover:bg-white/5" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
          }`}
        >
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); e.target.value = ""; }}
          />
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-white/10" : "bg-indigo-50"}`}>
            {pdfUploading ? (
              <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={isDark ? "text-indigo-300" : "text-indigo-500"}>
                <path d="M12 2H5C4.44772 2 4 2.44772 4 3V17C4 17.5523 4.44772 18 5 18H15C15.5523 18 16 17.5523 16 17V6L12 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M12 2V6H16" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M8 13L10 11L12 13M10 11V16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
              {pdfUploading ? "문서를 파싱하는 중..." : "PDF 업로드"}
            </p>
            <p className={`text-xs mt-0.5 ${isDark ? "text-white/45" : "text-slate-400"}`}>
              {pdfUploading ? "잠시만 기다려주세요." : "클릭하거나 파일을 끌어다 놓으면 문서 파싱 페이지로 이동합니다."}
            </p>
          </div>
          {!pdfUploading && (
            <div className={`ml-auto shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${isDark ? "border-white/15 text-white/60" : "border-slate-200 text-slate-500"}`}>
              파일 선택
            </div>
          )}
        </section>

        <section className={`overflow-hidden rounded-2xl border p-4 shadow-sm ${boxClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${textSub}`}>03</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"}`}>
                  채용 · 시험 일정
                </span>
              </div>
              <h2 className={`mt-2 text-lg font-bold ${textMain}`}>채용 마감 · 자격증 캘린더</h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className={`flex items-center overflow-hidden rounded-lg border text-xs font-bold ${
                isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
              }`}>
                {([
                  ["", "전체"],
                  ["early", "신입/인턴"],
                  ["career", "경력"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value || "all"}
                    onClick={() => setCalendarJobTypeFilter(value)}
                    className={`px-3 py-1.5 transition-colors ${
                      calendarJobTypeFilter === value
                        ? "bg-indigo-600 text-white"
                        : isDark ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={`flex items-center overflow-hidden rounded-lg border text-xs font-bold ${
                isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
              }`}>
                <button
                  onClick={() => moveExamMonth(-1)}
                  className={`px-3 py-1.5 transition-colors ${isDark ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
                  aria-label="이전 달"
                >
                  ‹
                </button>
                <span className={`min-w-24 border-x px-3 py-1.5 text-center ${isDark ? "border-white/10 text-white/80" : "border-slate-200 text-slate-700"}`}>
                  {examMonth.getFullYear()}.{String(examMonth.getMonth() + 1).padStart(2, "0")}
                </span>
                <button
                  onClick={() => moveExamMonth(1)}
                  className={`px-3 py-1.5 transition-colors ${isDark ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
                  aria-label="다음 달"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
            <div className={`overflow-hidden rounded-xl border ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className={`grid grid-cols-7 border-b text-center text-[11px] font-bold ${isDark ? "border-white/10 bg-white/5 text-white/45" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                {WEEKDAYS.map((day) => (
                  <div key={day} className="py-2">{day}</div>
                ))}
              </div>

              {examLoading ? (
                <div className="grid grid-cols-7">
                  {Array.from({ length: 42 }).map((_, index) => (
                    <div key={index} className={`h-16 border-b border-r ${isDark ? "border-white/5 bg-white/[0.03]" : "border-slate-100 bg-slate-50/70"} animate-pulse`} />
                  ))}
                </div>
              ) : examError ? (
                <div className={`flex h-36 items-center justify-center text-sm ${isDark ? "text-red-300" : "text-red-500"}`}>
                  {examError}
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {examCalendarDays.map((day) => {
                    const key = toDateKey(day);
                    const events = examEventsByDate.get(key) ?? [];
                    const isCurrentMonth = day.getMonth() === examMonth.getMonth();
                    const isToday = key === toDateKey(new Date());

                    return (
                      <div
                        key={key}
                        className={`min-h-16 border-b border-r p-1.5 ${isDark ? "border-white/5" : "border-slate-100"} ${
                          isCurrentMonth ? "" : isDark ? "bg-white/[0.02] opacity-45" : "bg-slate-50/60 text-slate-300"
                        }`}
                      >
                        <div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                          isToday ? "bg-indigo-600 text-white" : isDark ? "text-white/45" : "text-slate-400"
                        }`}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-1">
                          {events.slice(0, 2).map((event) => (
                            <button
                              key={`${event.id}-${key}`}
                              type="button"
                              onClick={() => openJobDetail(event)}
                              disabled={!event.job}
                              title={`${event.title} ${scheduleLabel(event)}${event.description ? ` · ${event.description}` : ""}`}
                              className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-bold transition-transform ${scheduleTone(event, isDark)} ${
                                event.job ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-sm" : "cursor-default"
                              }`}
                            >
                              <span className="mr-1">{event.label}</span>
                              {event.title}
                            </button>
                          ))}
                          {events.length > 2 && (
                            <button
                              type="button"
                              onClick={() => openDateEvents(key, events)}
                              className={`text-[10px] font-semibold underline-offset-2 transition-colors hover:underline ${
                                isDark ? "text-indigo-300 hover:text-indigo-200" : "text-indigo-600 hover:text-indigo-700"
                              }`}
                            >
                              +{events.length - 2}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`rounded-xl border p-3 ${subtleBoxClass}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold ${textMain}`}>이번 달 일정</h3>
                <span className={`text-xs font-semibold ${textSub}`}>{calendarEvents.length}건</span>
              </div>
              <div className="mt-3 max-h-[21rem] space-y-2 overflow-y-auto pr-1">
                {examLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className={`h-11 rounded-lg ${isDark ? "bg-white/5" : "bg-white"} animate-pulse`} />
                  ))
                ) : upcomingExams.length === 0 ? (
                  <div className={`flex h-28 items-center justify-center text-sm ${textSub}`}>등록된 일정이 없습니다.</div>
                ) : (
                  upcomingExams.map((event) => {
                    const date = new Date(`${event.date}T00:00:00`);
                    const dateLabel = Number.isNaN(date.getTime())
                      ? "날짜 없음"
                      : date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openJobDetail(event)}
                        disabled={!event.job}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                        } ${event.job ? isDark ? "hover:bg-white/10" : "hover:bg-slate-50" : "cursor-default"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate text-sm font-bold ${textMain}`}>{event.title}</p>
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${scheduleTone(event, false)}`}>
                            {scheduleLabel(event)}
                          </span>
                        </div>
                        <p className={`mt-1 truncate text-xs ${textSub}`}>{dateLabel} · {event.description}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={`relative flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border shadow-sm ${boxClass}`}>
          <div className="flex justify-end border-slate-200 px-5 py-4 dark:border-white/10">
            <button
              onClick={() => router.push("/recruit/write")}
              className={`text-m font-bold transition-colors ${isDark ? "text-white hover:text-indigo-300" : "text-slate-900 hover:text-indigo-600"}`}
            >
              상세 페이지
            </button>
          </div>
          <div className="flex flex-1 flex-col px-5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="자소서를 작성하세요. 작성 후 아래 맞춤법 또는 글 평가 버튼을 누르면 결과 팝업이 열립니다."
                className={`min-h-56 flex-1 resize-none bg-transparent text-left text-base leading-7 outline-none placeholder:text-slate-400 ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              />
          </div>

          <div className="flex justify-end border-t border-slate-200 dark:border-white/10">
            <button
              onClick={() => runDraftAssist("spellcheck")}
              disabled={!canRunAssist}
              className={`inline-flex min-w-36 items-center justify-center gap-2 border-l border-slate-200 px-6 py-5 text-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 ${isDark ? "text-white hover:bg-white/10" : "text-slate-900 hover:bg-slate-100"}`}
            >
              <IconSpellcheck />
              맞춤법
            </button>
            <button
              onClick={() => runDraftAssist("evaluate")}
              disabled={!canRunAssist}
              className={`inline-flex min-w-36 items-center justify-center gap-2 border-l border-slate-200 px-6 py-5 text-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 ${isDark ? "text-white hover:bg-white/10" : "text-slate-900 hover:bg-slate-100"}`}
            >
              <IconEvaluate />
              글 평가
            </button>
          </div>
        </section>
      </div>

      {selectedDateEvents && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setSelectedDateEvents(null)}
        >
          <div
            className={`flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div>
                <h3 className={`text-lg font-bold ${textMain}`}>전체 일정</h3>
                <p className={`text-xs font-semibold ${textSub}`}>{selectedDateEvents.date} · {selectedDateEvents.events.length}건</p>
              </div>
              <button
                onClick={() => setSelectedDateEvents(null)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {selectedDateEvents.events.map((event) => (
                  <button
                    key={`${event.id}-date-modal`}
                    type="button"
                    onClick={() => openJobDetail(event)}
                    disabled={!event.job}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
                    } ${event.job ? isDark ? "hover:bg-white/10" : "hover:bg-white" : "cursor-default"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`min-w-0 truncate text-sm font-bold ${textMain}`}>{event.title}</span>
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${scheduleTone(event, isDark)}`}>
                        {scheduleLabel(event)}
                      </span>
                    </div>
                    {event.description && (
                      <p className={`mt-1 line-clamp-2 text-xs ${textSub}`}>{event.description}</p>
                    )}
                    {event.job && (
                      <p className={`mt-2 text-[11px] font-semibold ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                        공고 정보 보기
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedJobEvent && selectedJobDetail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={closeJobDetail}
        >
          <div
            className={`flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-bold ${scheduleTone(selectedJobEvent, isDark)}`}>
                    {scheduleLabel(selectedJobEvent)}
                  </span>
                  <span className={`text-xs font-semibold ${textSub}`}>{selectedJobEvent.date}</span>
                </div>
                <h3 className={`mt-3 truncate text-xl font-bold ${textMain}`}>{selectedJobDetail.company}</h3>
                <p className={`mt-1 line-clamp-2 text-sm font-semibold ${isDark ? "text-white/75" : "text-slate-700"}`}>
                  {selectedJobDetail.title}
                </p>
              </div>
              <button
                onClick={closeJobDetail}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["직무", selectedJobDetail.jobs || selectedJobDetail.category],
                  ["고용형태", selectedJobDetail.type],
                  ["지역", selectedJobDetail.location],
                  ["기업유형", selectedJobDetail.companyType],
                  ["시작일", selectedJobDetail.startDate],
                  ["마감일", selectedJobDetail.endDate || selectedJobDetail.deadline],
                ].map(([label, value]) => (
                  value ? (
                    <div key={label} className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                      <p className={`text-[11px] font-bold ${textSub}`}>{label}</p>
                      <p className={`mt-1 text-sm font-semibold ${textMain}`}>{value}</p>
                    </div>
                  ) : null
                ))}
              </div>

              <div className="mt-4">
                <h4 className={`text-sm font-bold ${textMain}`}>상세 내용</h4>
                {jobDetailLoading ? (
                  <div className={`mt-2 flex h-28 items-center justify-center gap-2 rounded-xl border text-sm ${isDark ? "border-white/10 text-white/50" : "border-slate-200 text-slate-500"}`}>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                    공고 상세를 불러오는 중...
                  </div>
                ) : jobDetailError ? (
                  <div className={`mt-2 rounded-xl border px-4 py-3 text-sm ${isDark ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-600"}`}>
                    {jobDetailError}
                  </div>
                ) : selectedJobDetail.detailHtml ? (
                  <div
                    className={`mt-2 max-h-64 overflow-y-auto rounded-xl border px-4 py-3 ${PROSE_CLASS} ${
                      isDark ? "border-white/10 bg-white/5 prose-invert [&_*]:text-white/75" : "border-slate-200 bg-white"
                    }`}
                    dangerouslySetInnerHTML={{ __html: selectedJobDetail.detailHtml }}
                  />
                ) : selectedJobDetail.detailContent ? (
                  <div className={`mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm leading-6 ${
                    isDark ? "border-white/10 bg-white/5 text-white/75" : "border-slate-200 bg-white text-slate-700"
                  }`}>
                    {selectedJobDetail.detailContent}
                  </div>
                ) : (
                  <div className={`mt-2 rounded-xl border px-4 py-3 text-sm ${isDark ? "border-white/10 bg-white/5 text-white/50" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    저장된 상세 내용이 없습니다. 원문 공고에서 확인해 주세요.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              <button
                onClick={() => router.push("/recruit/job-posting")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  isDark ? "border-white/15 text-white/75 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                채용 상세 페이지
              </button>
              {selectedJobDetail.url && (
                <a
                  href={selectedJobDetail.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  원문 공고 열기
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {assistMode && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => !assistLoading && closeAssist()}
        >
          <div
            className={`flex max-h-[86dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
                  {assistMode === "spellcheck" ? <IconSpellcheck /> : <IconEvaluate />}
                </span>
                <div>
                  <h3 className={`text-lg font-bold ${textMain}`}>{assistTitle}</h3>
                  <p className={`text-xs ${textSub}`}>{assistLoading ? "AI가 내용을 검토하고 있습니다." : "검토 결과를 확인하세요."}</p>
                </div>
              </div>
              <button
                onClick={() => closeAssist()}
                disabled={assistLoading}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                  isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {assistError ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${isDark ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-600"}`}>
                  {assistError}
                </div>
              ) : !assistResult && assistLoading ? (
                <div className={`flex h-56 items-center justify-center gap-2 text-sm ${textSub}`}>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                  결과를 생성하는 중...
                </div>
              ) : (
                <div className={`${PROSE_CLASS} ${isDark ? "prose-invert [&_*]:text-white/80" : ""}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{assistResult || "결과가 없습니다."}</ReactMarkdown>
                  {assistLoading && <span className="inline-block h-4 w-1 animate-pulse rounded bg-indigo-500" />}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              {assistMode === "spellcheck" && assistResult.trim() && (
                <button
                  onClick={() => {
                    setDraft(assistResult.trim());
                    closeAssist();
                  }}
                  disabled={assistLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
                >
                  결과를 본문에 적용
                </button>
              )}
              <button
                onClick={() => router.push("/recruit/write")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  isDark ? "border-white/15 text-white/75 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                작성 페이지에서 이어가기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
