import type { DragEvent, FormEvent, MouseEvent, RefObject } from "react";
import type { CompanySlimItem } from "@/lib/api/companies";
import type { ResumeTarget } from "@/lib/api/resume";
import type { CoverLetter } from "@/lib/api/recruit/cover-letter";
import type { JobRecommendation } from "@/lib/api/recruit/job-posting";
import type { CalendarJobTypeFilter, RecruitCalendarEvent } from "../_hooks/useExamCalendar";
import {
  WEEKDAYS,
  deadlineBadge,
  jobMeta,
  scheduleLabel,
  scheduleTone,
  type InfoTab,
} from "../_lib/dashboard";
import { IconEvaluate, IconSpellcheck } from "./icons";

type ThemeProps = {
  isDark: boolean;
  boxClass: string;
  textMain: string;
  textSub: string;
};

export function CompanyAnalysisSection({
  companies,
  visibleCompanies,
  search,
  loading,
  error,
  isDark,
  boxClass,
  textMain,
  textSub,
  onSearchChange,
  onSubmitSearch,
  onOpenCompanies,
  onOpenCompany,
}: ThemeProps & {
  companies: CompanySlimItem[];
  visibleCompanies: CompanySlimItem[];
  search: string;
  loading: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onSubmitSearch: () => void;
  onOpenCompanies: () => void;
  onOpenCompany: (companyId: string) => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (visibleCompanies.length === 0) onSubmitSearch();
  };

  return (
    <section className={`flex min-h-[20rem] flex-col overflow-hidden rounded-md border p-5 ${boxClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${textSub}`}>01</span>
            <span className={`rounded-sm border px-3 py-1 text-xs font-semibold ${isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"}`}>
              기업 리서치
            </span>
          </div>
          <h1 className={`mt-4 text-3xl font-bold tracking-tight ${textMain}`}>기업 분석</h1>
          <p className={`mt-2 text-sm ${textSub}`}>최근 분석한 기업 10개를 바로 확인합니다.</p>
        </div>
        <button
          onClick={onOpenCompanies}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all border ${
            isDark
              ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/40"
              : "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300"
          }`}
        >
          상세 페이지
        </button>
      </div>

      <form className="mt-5 flex gap-2" onSubmit={handleSubmit}>
        <div className="relative min-w-0 flex-1">
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-white/35" : "text-slate-400"}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="기업명, 산업, 규모 검색"
            className={`h-9 w-full rounded-md border pl-9 pr-3 text-sm outline-none transition-colors ${
              isDark
                ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50"
                : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
            }`}
          />
        </div>
        <button
          type="submit"
          className={`h-9 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors ${
            isDark ? "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white" : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          {search.trim() && visibleCompanies.length === 0 ? "상세 검색" : "검색"}
        </button>
      </form>

      <div className="mt-5 flex-1">
        {loading ? (
          <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>기업 분석을 불러오는 중...</div>
        ) : error ? (
          <div className={`flex h-44 items-center justify-center text-sm ${isDark ? "text-red-300" : "text-red-500"}`}>{error}</div>
        ) : companies.length === 0 ? (
          <div className={`flex h-44 flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
            <span>표시할 기업 분석이 없습니다.</span>
            <button
              onClick={onOpenCompanies}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              기업 분석 시작
            </button>
          </div>
        ) : visibleCompanies.length === 0 ? (
          <div className={`flex h-44 flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
            <span>저장된 분석에서 찾지 못했습니다.</span>
            <button
              onClick={onSubmitSearch}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              상세 페이지에서 검색
            </button>
          </div>
        ) : (
          <ol className="grid gap-2 sm:grid-cols-2">
            {visibleCompanies.map((company) => (
              <li key={company.id}>
                <button
                  onClick={() => onOpenCompany(company.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                    isDark ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-50 text-indigo-600"
                  }`}>
                    {(company.name[0] ?? "C").toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-bold ${textMain}`}>{company.name}</span>
                    <span className={`block truncate text-xs ${textSub}`}>{company.companyType ?? "기업 분석"}</span>
                  </span>
                  <svg className={`shrink-0 ${isDark ? "text-white/25" : "text-slate-300"}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function InfoTabsSection({
  activeTab,
  jobs,
  loading,
  error,
  coverLetters,
  coverLoading,
  coverError,
  isDark,
  boxClass,
  textMain,
  textSub,
  onTabChange,
  onOpenDetail,
  onOpenCoverLetter,
  onDeleteJob,
}: ThemeProps & {
  activeTab: InfoTab;
  jobs: JobRecommendation[];
  loading: boolean;
  error: string | null;
  coverLetters: CoverLetter[];
  coverLoading: boolean;
  coverError: string | null;
  onTabChange: (tab: InfoTab) => void;
  onOpenDetail: (tab: InfoTab) => void;
  onOpenCoverLetter: (letterId: string) => void;
  onDeleteJob: (event: MouseEvent, job: JobRecommendation) => void;
}) {
  return (
    <section className={`flex min-h-[20rem] flex-col overflow-hidden rounded-md border ${boxClass}`}>
      <div className="grid grid-cols-3 border-b border-slate-200 dark:border-white/10">
        {([
          ["jobs", "채용 공고"],
          ["letters", "자소서"],
          ["spec", "스펙"],
        ] as const).map(([tab, label], index) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`${index > 0 ? "border-l border-slate-200 dark:border-white/10" : ""} py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-950"
                : isDark ? "text-white/55 hover:bg-white/5 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center justify-between sm:w-auto">
            <h2 className={`text-base font-bold sm:text-lg ${textMain}`}>
              {activeTab === "jobs" ? "채용 정보" : activeTab === "letters" ? "최근 자소서" : "스펙"}
            </h2>
            <button
              onClick={() => onOpenDetail(activeTab)}
              className="rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors sm:hidden text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-white/10"
            >
              상세 페이지
            </button>
          </div>

          <div className="flex items-center justify-start gap-2 w-full sm:w-auto sm:justify-end">
            <button
              onClick={() => onOpenDetail(activeTab)}
              className="hidden sm:inline-flex rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-white/10"
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
            ) : jobs.length === 0 ? (
              <div className={`flex h-44 items-center justify-center text-sm ${textSub}`}>표시할 공고가 없습니다.</div>
            ) : (
              <ol className="space-y-2">
                {jobs.map((job, index) => {
                  const badge = deadlineBadge(job);
                  return (
                    <li key={job.jobPostingId} className="flex items-center gap-1">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`grid flex-1 grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
                      >
                        <span className={`text-sm sm:text-base font-black tabular-nums ${isDark ? "text-white/35" : "text-slate-400"}`}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className={`block truncate text-xs sm:text-sm font-bold ${textMain}`}>{job.company}</span>
                          <span className={`block truncate text-[11px] sm:text-xs ${textSub}`}>{job.title} · {jobMeta(job)}</span>
                        </span>
                        <span className={`rounded-md border px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs font-bold ${
                          badge.urgent
                            ? "border-rose-200 bg-rose-50 text-rose-600"
                            : "border-amber-200 bg-amber-50 text-amber-600"
                        }`}>
                          {badge.text}
                        </span>
                      </a>
                      <button
                        onClick={(event) => onDeleteJob(event, job)}
                        className={`shrink-0 rounded p-1 text-xs transition-colors ${isDark ? "text-white/25 hover:text-white/60 hover:bg-white/10" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}
                        title="추천 공고 삭제"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : activeTab === "letters" ? (
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
                      onClick={() => onOpenCoverLetter(letter.id)}
                      className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
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
        ) : (
          <div className={`mt-4 flex flex-1 items-center justify-center rounded-md border border-dashed text-sm ${
            isDark ? "border-white/10 text-white/35" : "border-slate-200 text-slate-400"
          }`}>
            스펙 영역은 아직 구성 전입니다.
          </div>
        )}
      </div>
    </section>
  );
}

export function ExperienceLibrarySection({
  resumes,
  loading,
  isDark,
  boxClass,
  textMain,
  textSub,
  onOpenResume,
}: ThemeProps & {
  resumes: ResumeTarget[];
  loading: boolean;
  onOpenResume: (resumeId?: string) => void;
}) {
  const groupedResumes = resumes.reduce<Record<string, ResumeTarget[]>>((groups, resume) => {
    const rawDate = resume.appliedAt || resume.updatedAt || "";
    const matchedYear = rawDate.match(/\d{4}/)?.[0] ?? "연도 미정";
    if (!groups[matchedYear]) groups[matchedYear] = [];
    groups[matchedYear].push(resume);
    return groups;
  }, {});
  const years = Object.keys(groupedResumes).sort((a, b) => {
    if (a === "연도 미정") return 1;
    if (b === "연도 미정") return -1;
    return b.localeCompare(a);
  });

  return (
    <section className={`overflow-hidden rounded-md border p-5 ${boxClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${textSub}`}>02</span>
            <span className={`rounded-sm border px-3 py-1 text-xs font-semibold ${isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"}`}>
              이력서 · 경험
            </span>
          </div>
          <h2 className={`mt-4 text-3xl font-bold tracking-tight ${textMain}`}>이력서</h2>
          <p className={`mt-2 text-sm ${textSub}`}>
            {loading ? "불러오는 중..." : `${resumes.length}개의 이력서가 저장되어 있습니다.`}
          </p>
        </div>
        <button
          onClick={() => onOpenResume()}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${isDark ? "text-indigo-300 hover:bg-white/10" : "text-indigo-600 hover:bg-indigo-50"}`}
        >
          이력서 관리
        </button>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`h-10 rounded-md animate-pulse ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
            ))}
          </div>
        ) : resumes.length === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-3 py-10 text-sm ${textSub}`}>
            <span>저장된 이력서가 없습니다.</span>
            <button
              onClick={() => onOpenResume()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              이력서 추가하기
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {years.map((year) => (
              <div key={year}>
                <div className="mb-2 flex items-center gap-3">
                  <span className={`text-sm font-black ${isDark ? "text-white/45" : "text-slate-400"}`}>{year}</span>
                  <span className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                </div>
                <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedResumes[year].map((resume, index) => (
                    <li key={resume.id}>
                      <button
                        onClick={() => onOpenResume(resume.id)}
                        className={`grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                          isDark
                            ? "border-white/10 bg-white/[0.03] hover:bg-white/10"
                            : "border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/40"
                        }`}
                      >
                        <span className={`text-xl font-black tabular-nums ${isDark ? "text-white/20" : "text-slate-200"}`}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className={`block truncate text-base font-black ${textMain}`}>
                            {resume.companyName || "기업명 미입력"}
                          </span>
                          <span className={`mt-1 block truncate text-xs ${textSub}`}>
                            {[resume.jobTitle, resume.appliedAt?.slice(5), `${resume.selfIntroductions.length}문항`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className={`text-xl ${isDark ? "text-white/25" : "text-slate-300"}`}>›</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function PdfUploadCard({
  inputRef,
  uploading,
  dragOver,
  isDark,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onFileChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  dragOver: boolean;
  isDark: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onClick: () => void;
  onFileChange: (file: File) => void;
}) {
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={`relative flex items-center gap-4 px-5 py-4 rounded-md border-2 border-dashed cursor-pointer transition-all select-none ${
        dragOver
          ? isDark ? "border-indigo-400 bg-indigo-500/10" : "border-indigo-400 bg-indigo-50"
          : isDark ? "border-white/15 hover:border-indigo-400/50 hover:bg-white/5" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileChange(file);
          event.target.value = "";
        }}
      />
      <div className={`shrink-0 w-10 h-10 rounded-md flex items-center justify-center ${isDark ? "bg-white/10" : "bg-indigo-50"}`}>
        {uploading ? (
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
          {uploading ? "문서를 파싱하는 중..." : "PDF 업로드"}
        </p>
        <p className={`text-xs mt-0.5 ${isDark ? "text-white/45" : "text-slate-400"}`}>
          {uploading ? "잠시만 기다려주세요." : "클릭하거나 파일을 끌어다 놓으면 문서 파싱 페이지로 이동합니다."}
        </p>
      </div>
      {!uploading && (
        <div className={`ml-auto shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${isDark ? "border-white/15 text-white/60" : "border-slate-200 text-slate-500"}`}>
          파일 선택
        </div>
      )}
    </section>
  );
}

export function DraftAssistSection({
  draft,
  canRunAssist,
  isDark,
  boxClass,
  onDraftChange,
  onOpenWrite,
  onRunAssist,
}: {
  draft: string;
  canRunAssist: boolean;
  isDark: boolean;
  boxClass: string;
  onDraftChange: (value: string) => void;
  onOpenWrite: () => void;
  onRunAssist: (mode: "spellcheck" | "evaluate") => void;
}) {
  return (
    <section className={`relative flex min-h-[24rem] flex-col overflow-hidden rounded-md border ${boxClass}`}>
      <div className="flex justify-end border-slate-200 px-5 py-4 dark:border-white/10">
        <button
          onClick={onOpenWrite}
          className={`text-m font-bold transition-colors ${isDark ? "text-white hover:text-indigo-300" : "text-slate-900 hover:text-indigo-600"}`}
        >
          상세 페이지
        </button>
      </div>
      <div className="flex flex-1 flex-col px-5">
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="자소서를 작성하세요. 작성 후 아래 맞춤법 또는 글 평가 버튼을 누르면 결과 팝업이 열립니다."
          className={`min-h-56 flex-1 resize-none bg-transparent text-left text-base leading-7 outline-none placeholder:text-slate-400 ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        />
      </div>

      <div className="flex justify-end border-t border-slate-200 dark:border-white/10">
        <button
          onClick={() => onRunAssist("spellcheck")}
          disabled={!canRunAssist}
          className={`inline-flex min-w-36 items-center justify-center gap-2 border-l border-slate-200 px-6 py-5 text-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 ${isDark ? "text-white hover:bg-white/10" : "text-slate-900 hover:bg-slate-100"}`}
        >
          <IconSpellcheck />
          맞춤법
        </button>
        <button
          onClick={() => onRunAssist("evaluate")}
          disabled={!canRunAssist}
          className={`inline-flex min-w-36 items-center justify-center gap-2 border-l border-slate-200 px-6 py-5 text-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 ${isDark ? "text-white hover:bg-white/10" : "text-slate-900 hover:bg-slate-100"}`}
        >
          <IconEvaluate />
          글 평가
        </button>
      </div>
    </section>
  );
}

export function RecruitCalendarSection({
  calendarJobTypeFilter,
  examMonth,
  examLoading,
  examError,
  examCalendarDays,
  examEventsByDate,
  upcomingExams,
  calendarEvents,
  subtleBoxClass,
  isDark,
  boxClass,
  textMain,
  textSub,
  moveExamMonth,
  toDateKey,
  onFilterChange,
  onOpenJobDetail,
  onOpenDateEvents,
}: ThemeProps & {
  calendarJobTypeFilter: CalendarJobTypeFilter;
  examMonth: Date;
  examLoading: boolean;
  examError: string | null;
  examCalendarDays: Date[];
  examEventsByDate: Map<string, RecruitCalendarEvent[]>;
  upcomingExams: RecruitCalendarEvent[];
  calendarEvents: RecruitCalendarEvent[];
  subtleBoxClass: string;
  moveExamMonth: (delta: number) => void;
  toDateKey: (date: Date) => string;
  onFilterChange: (filter: CalendarJobTypeFilter) => void;
  onOpenJobDetail: (event: RecruitCalendarEvent) => void;
  onOpenDateEvents: (date: string, events: RecruitCalendarEvent[]) => void;
}) {
  return (
    <section className={`overflow-hidden rounded-md border p-4 ${boxClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${textSub}`}>03</span>
            <span className={`rounded-sm border px-2.5 py-1 text-xs font-semibold ${isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"}`}>
              채용 · 시험 일정
            </span>
          </div>
          <h2 className={`mt-2 text-lg font-bold ${textMain}`}>채용 마감 · 자격증 캘린더</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className={`flex items-center overflow-hidden rounded-md border text-xs font-bold ${
            isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
          }`}>
            {([
              ["", "전체"],
              ["early", "신입/인턴"],
              ["career", "경력"],
            ] as const).map(([value, label]) => (
              <button
                key={value || "all"}
                onClick={() => onFilterChange(value)}
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
          <div className={`flex items-center overflow-hidden rounded-md border text-xs font-bold ${
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

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <div className={`overflow-hidden rounded-md border ${isDark ? "border-white/10" : "border-slate-200"}`}>
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
                    <div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-bold ${
                      isToday ? "bg-indigo-600 text-white" : isDark ? "text-white/45" : "text-slate-400"
                    }`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {events.slice(0, 2).map((event) => (
                        <button
                          key={`${event.id}-${key}`}
                          type="button"
                          onClick={() => onOpenJobDetail(event)}
                          disabled={!event.job}
                          title={`${event.title} ${scheduleLabel(event)}${event.description ? ` · ${event.description}` : ""}`}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-bold transition-transform ${scheduleTone(event, isDark)} ${
                            event.job ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"
                          }`}
                        >
                          <span className="mr-1">{event.label}</span>
                          {event.title}
                        </button>
                      ))}
                      {events.length > 2 && (
                        <button
                          type="button"
                          onClick={() => onOpenDateEvents(key, events)}
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

        <div className={`flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-md border p-3 lg:h-[26.25rem] lg:max-h-[26.25rem] ${subtleBoxClass}`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${textMain}`}>이번 달 일정</h3>
            <span className={`text-xs font-semibold ${textSub}`}>{calendarEvents.length}건</span>
          </div>
          <div className="mt-3 md:min-h-0 md:flex-1 md:space-y-2 md:overflow-y-auto md:pr-1 max-md:flex max-md:gap-2.5 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:pb-1 max-md:-mx-3 max-md:px-3">
            {examLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={`h-11 rounded-md md:h-11 max-md:w-44 max-md:shrink-0 ${isDark ? "bg-white/5" : "bg-white"} animate-pulse`} />
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
                    onClick={() => onOpenJobDetail(event)}
                    disabled={!event.job}
                    className={`rounded-md border px-3 py-2 text-left transition-colors
                      md:w-full
                      max-md:shrink-0 max-md:w-44 max-md:snap-start
                      ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}
                      ${event.job ? isDark ? "hover:bg-white/10" : "hover:bg-slate-50" : "cursor-default"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm font-bold ${textMain}`}>{event.title}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {event.job?.appliedAt && (
                          <span className="rounded px-1.5 py-0.5 text-2xs font-bold bg-emerald-50 text-emerald-600">지원</span>
                        )}
                        <span className={`rounded-md px-1.5 py-0.5 text-2xs font-bold ${scheduleTone(event, false)}`}>
                          {scheduleLabel(event)}
                        </span>
                      </div>
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
  );
}
