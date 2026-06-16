import type { ReactNode } from "react";
import type {
  ResumeTarget,
  ResumeVersionDetail,
  ResumeVersionSummary,
} from "@/lib/api/resume";
import { formatVersionDate } from "../_lib/resume-write-utils";

function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-6">
      <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function TextPreview({ children, empty = "내용 없음" }: { children?: string | null; empty?: string }) {
  const value = children?.trim();
  return (
    <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
      {value || <span className="text-slate-400">{empty}</span>}
    </div>
  );
}

function VersionPreview({
  detail,
  loading,
}: {
  detail: ResumeVersionDetail | null;
  loading: boolean;
}) {
  const target = detail?.target;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
        버전 내용을 불러오는 중...
      </div>
    );
  }

  if (!target) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
        오른쪽에서 버전을 선택하면 내용을 볼 수 있습니다.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-10 py-10">
      <div className="border border-slate-200 bg-white px-10 py-9 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-slate-400">선택한 버전</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">
              {target.companyName || "기업명 없음"}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {target.jobTitle || "직무 없음"}
            </p>
          </div>
          <div className="text-right text-xs font-semibold text-slate-500">
            <p>{detail ? formatVersionDate(detail.version.createdAt) : ""}</p>
            {target.appliedAt && <p className="mt-1">지원일 {target.appliedAt}</p>}
          </div>
        </div>

        <PreviewBlock title="채용공고">
          <TextPreview>{target.jd}</TextPreview>
        </PreviewBlock>

        <PreviewBlock title="교육 이수사항">
          {(target.trainings ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">등록된 교육 이수사항이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {(target.trainings ?? []).map((item, index) => (
                <article key={item.id || index} className="border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">{item.title || "교육명 없음"}</p>
                    <p className="text-xs font-semibold text-slate-400">
                      {[item.startDate, item.endDate].filter(Boolean).join(" ~ ")}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {[item.institution, item.hours ? `${item.hours}시간` : ""].filter(Boolean).join(" · ") || "교육기관 없음"}
                  </p>
                  <div className="mt-3">
                    <TextPreview>{item.description}</TextPreview>
                  </div>
                </article>
              ))}
            </div>
          )}
        </PreviewBlock>

        <PreviewBlock title="자기소개서">
          {target.selfIntroductions.length === 0 ? (
            <p className="text-sm text-slate-400">작성된 문항이 없습니다.</p>
          ) : (
            <div className="space-y-6">
              {target.selfIntroductions.map((intro, index) => (
                <article key={intro.id || index} className="border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-black text-slate-900">문항 {index + 1}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">
                    {intro.question || "문항 없음"}
                  </p>
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <TextPreview>{intro.answer}</TextPreview>
                  </div>
                </article>
              ))}
            </div>
          )}
        </PreviewBlock>

        <PreviewBlock title="학내외 활동">
          {(target.experiences ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">등록된 활동이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {(target.experiences ?? []).map((item, index) => (
                <article key={item.id || index} className="border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">
                      {item.activityType || "활동 구분 없음"}
                    </p>
                    <p className="text-xs font-semibold text-slate-400">
                      {[item.startDate, item.endDate].filter(Boolean).join(" ~ ")}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {[item.organizationName, item.role].filter(Boolean).join(" · ") || "기관/역할 없음"}
                  </p>
                  <div className="mt-3">
                    <TextPreview>{item.description}</TextPreview>
                  </div>
                </article>
              ))}
            </div>
          )}
        </PreviewBlock>

        <PreviewBlock title="수상">
          {(target.prizes ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">등록된 수상이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {(target.prizes ?? []).map((item, index) => (
                <article key={item.id || index} className="border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">{item.title || "수상명 없음"}</p>
                    <p className="text-xs font-semibold text-slate-400">{item.issuedDate}</p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {item.organization || "발급 기관 없음"}
                  </p>
                  <div className="mt-3">
                    <TextPreview>{item.description}</TextPreview>
                  </div>
                </article>
              ))}
            </div>
          )}
        </PreviewBlock>
      </div>
    </div>
  );
}

export function VersionHistoryPanel({
  currentTarget,
  versionPreview,
  versionPreviewLoading,
  versionError,
  versionsLoading,
  versions,
  selectedVersionId,
  versionActionId,
  onClose,
  onLoadVersionPreview,
  onRestoreVersion,
  onDeleteVersion,
}: {
  currentTarget: ResumeTarget | undefined;
  versionPreview: ResumeVersionDetail | null;
  versionPreviewLoading: boolean;
  versionError: string;
  versionsLoading: boolean;
  versions: ResumeVersionSummary[];
  selectedVersionId: string | null;
  versionActionId: string | null;
  onClose: () => void;
  onLoadVersionPreview: (versionId: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex bg-slate-100">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <VersionPreview detail={versionPreview} loading={versionPreviewLoading} />
      </section>
      <aside className="relative z-10 flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">버전 기록</h2>
            <p className="mt-1 text-xs text-slate-500">
              {currentTarget?.companyName || currentTarget?.jobTitle || "현재 이력서"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {versionError && (
            <div className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {versionError}
            </div>
          )}
          {versionsLoading ? (
            <div className="flex h-32 items-center justify-center text-xs font-medium text-slate-400">
              버전 기록을 불러오는 중...
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-xs font-medium text-slate-500">
              아직 저장된 버전 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version, index) => {
                const busy = versionActionId === version.id;
                const selected = selectedVersionId === version.id;
                return (
                  <div
                    key={version.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onLoadVersionPreview(version.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onLoadVersionPreview(version.id);
                      }
                    }}
                    className={`rounded-md border bg-white p-3 text-left transition-colors ${
                      selected
                        ? "border-slate-900 ring-1 ring-slate-900"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {index === 0 ? "현재 저장본" : formatVersionDate(version.createdAt)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {index === 0 ? formatVersionDate(version.createdAt) : (version.title || "제목 없음")}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                        #{versions.length - index}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRestoreVersion(version.id);
                        }}
                        className="rounded-md border border-indigo-200 px-2.5 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "복원"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || versions.length <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteVersion(version.id);
                        }}
                        className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-200 px-5 py-3 text-[11px] leading-5 text-slate-500">
          저장할 때마다 변경된 내용이 서버 버전 기록으로 남습니다. 같은 내용의 중복 기록은 자동으로 건너뜁니다.
        </div>
      </aside>
    </div>
  );
}
