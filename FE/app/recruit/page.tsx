"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/contexts/ThemeContext";
import { IconEvaluate, IconSpellcheck } from "./_components/icons";
import {
  CompanyAnalysisSection,
  DraftAssistSection,
  ExperienceLibrarySection,
  InfoTabsSection,
  PdfUploadCard,
  RecruitCalendarSection,
} from "./_components/dashboard-sections";
import { PROSE_CLASS } from "./_constants";
import { useDraftAssist } from "./_hooks/useDraftAssist";
import { useRecruitDashboardData } from "./_hooks/useRecruitDashboardData";
import { useExamCalendar, type CalendarJobTypeFilter } from "./_hooks/useExamCalendar";
import { useRecruitJobDetail } from "./_hooks/useRecruitJobDetail";
import { useRecruitPdfUpload } from "./_hooks/useRecruitPdfUpload";
import { scheduleLabel, scheduleTone, type InfoTab } from "./_lib/dashboard";

export default function RecruitPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const [activeTab, setActiveTab] = useState<InfoTab>("jobs");
  const [calendarJobTypeFilter, setCalendarJobTypeFilter] = useState<CalendarJobTypeFilter>("");
  const [analysisSearch, setAnalysisSearch] = useState("");
  const { draft, setDraft, assistMode, assistResult, assistLoading, assistError, runDraftAssist, closeAssist } = useDraftAssist();
  const {
    dragOver,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePdfFile,
    inputRef: pdfInputRef,
    openFilePicker,
    uploading: pdfUploading,
  } = useRecruitPdfUpload();
  const {
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
  } = useRecruitJobDetail();
  const {
    jobs,
    loading,
    error,
    resumes,
    resumeLoading,
    resumeError,
    coverLetters,
    coverLoading,
    coverError,
    companyAnalyses,
    analysisLoading,
    analysisError,
    visibleCompanyAnalyses,
    handleDeleteRecommendation,
  } = useRecruitDashboardData(activeTab, analysisSearch);
  const { examMonth, examLoading, examError, examCalendarDays, examEventsByDate, upcomingExams, calendarEvents, moveExamMonth, toDateKey } = useExamCalendar(calendarJobTypeFilter);

  const topJobs = jobs;

  const openCompanyAnalysisSearch = () => {
    const query = analysisSearch.trim();
    router.push(query ? `/companies/analysis?company=${encodeURIComponent(query)}` : "/companies");
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
          <CompanyAnalysisSection
            companies={companyAnalyses}
            visibleCompanies={visibleCompanyAnalyses}
            search={analysisSearch}
            loading={analysisLoading}
            error={analysisError}
            isDark={isDark}
            boxClass={boxClass}
            textMain={textMain}
            textSub={textSub}
            onSearchChange={setAnalysisSearch}
            onSubmitSearch={openCompanyAnalysisSearch}
            onOpenCompanies={() => router.push("/companies")}
            onOpenCompany={(companyId) => router.push(`/companies/${companyId}`)}
          />
          <InfoTabsSection
            activeTab={activeTab}
            jobs={topJobs}
            loading={loading}
            error={error}
            coverLetters={coverLetters}
            coverLoading={coverLoading}
            coverError={coverError}
            isDark={isDark}
            boxClass={boxClass}
            textMain={textMain}
            textSub={textSub}
            onTabChange={setActiveTab}
            onOpenDetail={(tab) => router.push(tab === "jobs" ? "/recruit/job-posting" : tab === "letters" ? "/recruit/cover-letter" : "/recruit/spec")}
            onOpenCoverLetter={(letterId) => router.push(`/recruit/cover-letter?cover=${encodeURIComponent(letterId)}`)}
            onDeleteJob={handleDeleteRecommendation}
          />
        </div>

        <ExperienceLibrarySection
          resumes={resumes}
          loading={resumeLoading}
          isDark={isDark}
          boxClass={boxClass}
          textMain={textMain}
          textSub={textSub}
          onOpenResume={(resumeId) =>
            router.push(resumeId ? `/recruit/resume/${encodeURIComponent(resumeId)}` : "/recruit/resume")
          }
        />

        <PdfUploadCard
          inputRef={pdfInputRef}
          uploading={pdfUploading}
          dragOver={dragOver}
          isDark={isDark}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFilePicker}
          onFileChange={handlePdfFile}
        />

        <RecruitCalendarSection
          calendarJobTypeFilter={calendarJobTypeFilter}
          examMonth={examMonth}
          examLoading={examLoading}
          examError={examError}
          examCalendarDays={examCalendarDays}
          examEventsByDate={examEventsByDate}
          upcomingExams={upcomingExams}
          calendarEvents={calendarEvents}
          subtleBoxClass={subtleBoxClass}
          isDark={isDark}
          boxClass={boxClass}
          textMain={textMain}
          textSub={textSub}
          moveExamMonth={moveExamMonth}
          toDateKey={toDateKey}
          onFilterChange={setCalendarJobTypeFilter}
          onOpenJobDetail={openJobDetail}
          onOpenDateEvents={openDateEvents}
        />

        <DraftAssistSection
          draft={draft}
          canRunAssist={canRunAssist}
          isDark={isDark}
          boxClass={boxClass}
          onDraftChange={setDraft}
          onOpenWrite={() => router.push("/recruit/write")}
          onRunAssist={runDraftAssist}
        />
      </div>

      {selectedDateEvents && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setSelectedDateEvents(null)}
        >
          <div
            className={`flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-md border ${
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
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
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
                    className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
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
            className={`flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-md border ${
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
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["직무", selectedJobDetail.jobs],
                  ["고용형태", selectedJobDetail.type],
                  ["지역", selectedJobDetail.location],
                  ["기업유형", selectedJobDetail.companyType],
                  ["시작일", selectedJobDetail.startDate],
                  ["마감일", selectedJobDetail.endDate || selectedJobDetail.deadline],
                  ["지원일", selectedJobDetail.appliedAt ? new Date(selectedJobDetail.appliedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : null],
                ].map(([label, value]) => (
                  value ? (
                    <div key={label} className={`rounded-md border px-3 py-2 ${label === "지원일" ? isDark ? "border-emerald-400/20 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50" : isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                      <p className={`text-[11px] font-bold ${label === "지원일" ? isDark ? "text-emerald-400" : "text-emerald-600" : textSub}`}>{label}</p>
                      <p className={`mt-1 text-sm font-semibold ${label === "지원일" ? isDark ? "text-emerald-300" : "text-emerald-700" : textMain}`}>{value}</p>
                    </div>
                  ) : null
                ))}
              </div>

              <div className="mt-4">
                <h4 className={`text-sm font-bold ${textMain}`}>상세 내용</h4>
                {jobDetailLoading ? (
                  <div className={`mt-2 flex h-28 items-center justify-center gap-2 rounded-md border text-sm ${isDark ? "border-white/10 text-white/50" : "border-slate-200 text-slate-500"}`}>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                    공고 상세를 불러오는 중...
                  </div>
                ) : jobDetailError ? (
                  <div className={`mt-2 rounded-md border px-4 py-3 text-sm ${isDark ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-600"}`}>
                    {jobDetailError}
                  </div>
                ) : selectedJobDetail.detailHtml ? (
                  <div
                    className={`mt-2 max-h-64 overflow-y-auto rounded-md border px-4 py-3 ${PROSE_CLASS} ${
                      isDark ? "border-white/10 bg-white/5 prose-invert [&_*]:text-white/75" : "border-slate-200 bg-white"
                    }`}
                    dangerouslySetInnerHTML={{ __html: selectedJobDetail.detailHtml }}
                  />
                ) : selectedJobDetail.detailContent ? (
                  <div className={`mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border px-4 py-3 text-sm leading-6 ${
                    isDark ? "border-white/10 bg-white/5 text-white/75" : "border-slate-200 bg-white text-slate-700"
                  }`}>
                    {selectedJobDetail.detailContent}
                  </div>
                ) : (
                  <div className={`mt-2 rounded-md border px-4 py-3 text-sm ${isDark ? "border-white/10 bg-white/5 text-white/50" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    저장된 상세 내용이 없습니다. 원문 공고에서 확인해 주세요.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              <button
                onClick={() => router.push("/recruit/job-posting")}
                className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                  isDark ? "border-white/15 text-white/75 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                채용 상세 페이지
              </button>
              {selectedJobDetail.appliedAt ? (
                <button
                  onClick={() => handleSetApplied(selectedJobDetail, null)}
                  className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                    isDark ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  ✓ 지원 완료
                </button>
              ) : (
                <button
                  onClick={() => handleSetApplied(selectedJobDetail, new Date().toISOString())}
                  className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                    isDark ? "border-white/15 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  지원 완료 표시
                </button>
              )}
              {selectedJobDetail.url && (
                <a
                  href={selectedJobDetail.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
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
            className={`flex max-h-[86dvh] w-full max-w-3xl flex-col overflow-hidden rounded-md border ${
              isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-md ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"}`}>
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
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                  isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {assistError ? (
                <div className={`rounded-md border px-4 py-3 text-sm ${isDark ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-600"}`}>
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
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
                >
                  결과를 본문에 적용
                </button>
              )}
              <button
                onClick={() => router.push("/recruit/write")}
                className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
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
