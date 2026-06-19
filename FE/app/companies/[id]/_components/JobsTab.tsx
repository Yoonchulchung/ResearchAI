"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { CompanyListItem } from "@/lib/api/companies";
import {
  fetchJobPostingDetail,
  setJobPostingFavorite,
  type JobPosting,
} from "@/lib/api/recruit/job-posting";
import { JobDetail } from "@/recruit/job-posting/_components/JobDetail";
import type { CompanyJobType } from "../_hooks/useCompanyDetailData";

const JOB_TYPES: CompanyJobType[] = ["인턴", "신입", "경력"];

interface JobsTabProps {
  company: CompanyListItem;
  jobPostings: JobPosting[];
  jobsLoading: boolean;
  jobSearchLoading: boolean;
  handleJobSearch: () => void;
  selectedJobTypes: CompanyJobType[];
  toggleJobType: (type: CompanyJobType) => void;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
  mutedPanel: string;
}

function sourceLabel(source?: string | null) {
  const map: Record<string, string> = {
    linkareer: "링커리어",
    jobkorea: "잡코리아",
    catch: "캐치",
    jobplanet: "잡플래닛",
    jobda: "잡다",
    saramin: "사람인",
    "saramin-api": "사람인 API",
  };
  return source ? map[source] ?? source : "출처 미상";
}

function postingDate(posting: JobPosting) {
  return posting.endDate || posting.deadline || posting.startDate || "";
}

export function JobsTab({
  company,
  jobPostings,
  jobsLoading,
  jobSearchLoading,
  handleJobSearch,
  selectedJobTypes,
  toggleJobType,
  isDark,
  panelClass,
  subtleText,
  mutedPanel,
}: JobsTabProps) {
  const router = useRouter();
  const [selectedPosting, setSelectedPosting] = useState<JobPosting | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailCacheRef = useRef<Map<string, Partial<JobPosting>>>(new Map());

  useEffect(() => {
    if (
      selectedPosting &&
      !jobPostings.some((posting) => posting.id === selectedPosting.id)
    ) {
      setSelectedPosting(null);
    }
  }, [jobPostings, selectedPosting]);

  useEffect(() => {
    if (!selectedPosting) return;

    const cached = detailCacheRef.current.get(selectedPosting.id);
    if (cached) {
      setSelectedPosting((current) =>
        current?.id === selectedPosting.id
          ? { ...current, ...cached }
          : current,
      );
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetchJobPostingDetail(
      selectedPosting.id,
      selectedPosting.url,
      selectedPosting.source ?? "linkareer",
    )
      .then((detail) => {
        if (cancelled) return;
        detailCacheRef.current.set(selectedPosting.id, detail);
        setSelectedPosting((current) =>
          current?.id === selectedPosting.id
            ? { ...current, ...detail }
            : current,
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPosting?.id]);

  const handleToggleFavorite = async (
    posting: JobPosting,
    event?: MouseEvent<HTMLElement>,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();
    const favorite = !posting.favorite;

    setSelectedPosting((current) =>
      current?.id === posting.id ? { ...current, favorite } : current,
    );

    try {
      const result = await setJobPostingFavorite(posting.id, favorite);
      setSelectedPosting((current) =>
        current?.id === posting.id
          ? { ...current, favorite: result.favorite }
          : current,
      );
    } catch {
      setSelectedPosting((current) =>
        current?.id === posting.id
          ? { ...current, favorite: posting.favorite }
          : current,
      );
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">채용공고</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="채용 유형 필터">
            {JOB_TYPES.map((type) => {
              const selected = selectedJobTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleJobType(type)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    selected
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : isDark
                        ? "border-white/15 text-white/55 hover:border-white/30 hover:text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {jobSearchLoading ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500">
              <span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              검색 중...
            </div>
          ) : (
            <button
              onClick={handleJobSearch}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                isDark
                  ? "border border-white/15 text-white/70 hover:bg-white/10"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              채용 공고 검색
            </button>
          )}
          <button
            onClick={() => router.push(`/recruit/job-posting?company=${encodeURIComponent(company.name)}`)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
              isDark ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            전체 공고 보기
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-hidden rounded-md border ${panelClass}`}>
        {jobsLoading ? (
          <div className={`flex h-32 items-center justify-center text-sm ${subtleText}`}>채용공고를 불러오는 중...</div>
        ) : jobPostings.length === 0 ? (
          <div className={`flex h-32 items-center justify-center text-sm ${subtleText}`}>
            {selectedJobTypes.length === 0
              ? "조회할 채용 유형을 하나 이상 선택해 주세요."
              : "선택한 유형의 채용공고가 없습니다."}
          </div>
        ) : (
          <div className="flex h-full min-h-[520px] flex-col lg:min-h-0 lg:flex-row">
            <div
              className={`max-h-[420px] shrink-0 overflow-y-auto border-b p-3 lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r ${
                isDark ? "border-white/10" : "border-slate-200"
              }`}
            >
              <div className="space-y-2">
                {jobPostings.map((posting) => {
                  const selected = selectedPosting?.id === posting.id;
                  return (
                    <article
                      key={posting.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => setSelectedPosting(posting)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedPosting(posting);
                        }
                      }}
                      className={`rounded-md border p-3 transition-colors ${
                        selected
                          ? isDark
                            ? "border-indigo-400/50 bg-indigo-500/10"
                            : "border-indigo-300 bg-indigo-50"
                          : `${mutedPanel} hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:border-indigo-400/30 dark:hover:bg-indigo-500/5`
                      } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                              {sourceLabel(posting.source)}
                            </span>
                            {posting.type ? (
                              <span className={`text-xs font-bold ${subtleText}`}>{posting.type}</span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 line-clamp-2 text-sm font-bold">{posting.title}</h3>
                          <p className={`mt-1 line-clamp-1 text-xs ${subtleText}`}>
                            {[posting.jobs, posting.location, posting.companyType].filter(Boolean).join(" · ") ||
                              "채용 정보"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-bold ${
                            isDark ? "bg-white/10 text-white/70" : "bg-white text-slate-600"
                          }`}
                        >
                          {postingDate(posting) || "상시"}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="flex h-[70vh] min-h-[520px] min-w-0 flex-1 overflow-hidden lg:h-full lg:min-h-0">
              {selectedPosting ? (
                <JobDetail
                  selected={selectedPosting}
                  detailLoading={detailLoading}
                  onToggleFavorite={handleToggleFavorite}
                  onScroll={() => {}}
                />
              ) : (
                <div className={`flex h-full min-h-[520px] items-center justify-center px-6 text-center text-sm ${subtleText}`}>
                  왼쪽 목록에서 확인할 채용공고를 선택해 주세요.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
