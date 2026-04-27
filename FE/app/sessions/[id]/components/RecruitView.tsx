"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Session, RecruitJob } from "@/types";
import { getSessionJobs, searchMoreJobs } from "@/lib/api/sessions";
import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  session: Session;
}

const SOURCE_TABS = [
  { id: "all", label: "전체" },
  { id: "linkareer", label: "링커리어" },
  { id: "wanted", label: "원티드" },
  { id: "jobplanet", label: "잡플래닛" },
  { id: "incruit", label: "인크루트" },
] as const;

type SourceTab = (typeof SOURCE_TABS)[number]["id"];

function detectSource(job: RecruitJob): string {
  if (job.source) return job.source;
  const url = job.url ?? "";
  if (url.includes("linkareer")) return "linkareer";
  if (url.includes("wanted")) return "wanted";
  if (url.includes("jobplanet")) return "jobplanet";
  if (url.includes("incruit")) return "incruit";
  return "other";
}

function JobCard({ job }: { job: RecruitJob }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl border px-4 py-3.5 transition-colors hover:border-blue-400 hover:shadow-sm ${
        isDark
          ? "bg-slate-800 border-slate-700 hover:bg-slate-750"
          : "bg-white border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm leading-snug truncate ${isDark ? "text-white" : "text-slate-900"}`}>
            {job.title}
          </p>
          <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
        {job.postedAt && (
          <span className={`text-xs shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {job.postedAt}
          </span>
        )}
      </div>
      {job.skills && job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {job.skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              className={`text-xs px-2 py-0.5 rounded-full ${
                isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
              }`}
            >
              {skill}
            </span>
          ))}
          {job.skills.length > 6 && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              +{job.skills.length - 6}
            </span>
          )}
        </div>
      )}
      {job.description && (
        <p className={`text-xs mt-2 line-clamp-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {job.description}
        </p>
      )}
    </a>
  );
}

export function RecruitView({ session }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [jobs, setJobs] = useState<RecruitJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SourceTab>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchLogs, setSearchLogs] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Extract keyword chips from job skills
  const allSkills = Array.from(
    new Set(jobs.flatMap((j) => j.skills ?? []))
  ).slice(0, 20);

  useEffect(() => {
    setLoading(true);
    getSessionJobs(session.id)
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.id]);

  const filteredJobs =
    activeTab === "all"
      ? jobs
      : jobs.filter((j) => detectSource(j) === activeTab);

  const countFor = (tab: SourceTab) =>
    tab === "all" ? jobs.length : jobs.filter((j) => detectSource(j) === tab).length;

  const handleSearch = useCallback(
    async (keyword: string) => {
      if (!keyword.trim() || searching) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setSearching(true);
      setSearchLogs([]);
      try {
        await searchMoreJobs(
          session.id,
          keyword.trim(),
          (event) => {
            if (event.type === "log") setSearchLogs((p) => [...p, event.message]);
            else if (event.type === "jobs")
              setJobs((prev) => {
                const existingIds = new Set(prev.map((j) => j.id));
                const newOnes = event.jobs.filter((j) => !existingIds.has(j.id));
                return [...prev, ...newOnes];
              });
          },
          ac.signal,
        );
      } catch {
        // aborted or error — ignore
      } finally {
        setSearching(false);
      }
    },
    [session.id, searching],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className={`px-8 py-3.5 border-b shrink-0 ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base font-semibold truncate flex-1" style={{ color: isDark ? "#f1f5f9" : "#0f172a" }}>
            {session.topic}
          </span>
          <span
            className="text-xs px-2.5 py-0.5 rounded-full font-medium"
            style={{
              background: isDark ? "#1e3a5f" : "#dbeafe",
              color: isDark ? "#93c5fd" : "#1d4ed8",
            }}
          >
            채용 공고
          </span>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="키워드로 추가 검색..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch(searchKeyword)}
            className={`flex-1 text-sm px-3 py-2 rounded-xl border outline-none transition-colors ${
              isDark
                ? "bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-blue-500"
                : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400"
            }`}
          />
          <button
            onClick={() => handleSearch(searchKeyword)}
            disabled={searching || !searchKeyword.trim()}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
              isDark
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {searching ? "검색 중…" : "검색"}
          </button>
          {searching && (
            <button
              onClick={() => { abortRef.current?.abort(); setSearching(false); }}
              className={`px-3 py-2 rounded-xl text-sm transition-colors ${
                isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-200 hover:bg-slate-300 text-slate-600"
              }`}
            >
              중단
            </button>
          )}
        </div>

        {/* Skill keyword chips */}
        {allSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {allSkills.map((skill) => (
              <button
                key={skill}
                onClick={() => { setSearchKeyword(skill); handleSearch(skill); }}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  isDark
                    ? "bg-slate-700 hover:bg-blue-800 text-slate-300 hover:text-blue-200"
                    : "bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700"
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        )}

        {/* Search logs */}
        {searchLogs.length > 0 && (
          <div
            className={`mt-2 text-xs rounded-lg px-3 py-2 space-y-0.5 max-h-24 overflow-y-auto ${
              isDark ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-500"
            }`}
          >
            {searchLogs.map((log, i) => (
              <p key={i}>{log}</p>
            ))}
          </div>
        )}
      </div>

      {/* Source tabs */}
      <div
        className={`flex gap-0 px-8 border-b shrink-0 ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
        }`}
      >
        {SOURCE_TABS.map((tab) => {
          const count = countFor(tab.id);
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? isDark
                    ? "border-blue-400 text-blue-400"
                    : "border-blue-500 text-blue-600"
                  : isDark
                  ? "border-transparent text-slate-500 hover:text-slate-300"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    active
                      ? isDark
                        ? "bg-blue-900 text-blue-300"
                        : "bg-blue-100 text-blue-600"
                      : isDark
                      ? "bg-slate-700 text-slate-400"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Job list */}
      <div className={`flex-1 overflow-y-auto px-8 py-5 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`rounded-xl border px-4 py-3.5 animate-pulse ${
                  isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
                }`}
              >
                <div className={`h-4 rounded w-2/5 mb-2 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
                <div className={`h-3 rounded w-1/4 ${isDark ? "bg-slate-700" : "bg-slate-100"}`} />
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            <p className="text-sm">채용 공고가 없습니다.</p>
            <p className="text-xs mt-1">위 검색창에서 키워드로 추가 검색해보세요.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
