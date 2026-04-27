"use client";

import { useState } from "react";
import { testLiveSearch, JobItem } from "@/lib/api";

const COMPANY_TYPE_OPTIONS = ["대기업", "중견기업", "중소기업", "스타트업", "외국계", "공기업"];
const JOB_TYPE_OPTIONS = ["신입", "경력", "인턴"];

type Status = "idle" | "running" | "ok" | "error";

export function RecruitTestPanel() {
  const [keyword, setKeyword] = useState("");
  const [companyTypes, setCompanyTypes] = useState<string[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);

  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [result, setResult] = useState("");
  const [ms, setMs] = useState<number | null>(null);

  function toggleCompanyType(v: string) {
    setCompanyTypes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  function toggleJobType(v: string) {
    setJobTypes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  async function run() {
    if (!keyword.trim()) return;
    setStatus("running");
    setLogs([]);
    setJobs([]);
    setResult("");
    setMs(null);
    const t = Date.now();
    try {
      const res = await testLiveSearch(keyword.trim(), companyTypes.length ? companyTypes : undefined, jobTypes.length ? jobTypes : undefined);
      setLogs(res.logs);
      setJobs(res.jobs);
      setResult(res.result);
      setMs(Date.now() - t);
      setStatus("ok");
    } catch (e) {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      {/* 입력 */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">검색 키워드</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="FastAPI 백엔드 개발자"
            className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div className="flex gap-6">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">기업 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_TYPE_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => toggleCompanyType(v)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    companyTypes.includes(v)
                      ? "bg-slate-100 text-slate-700 border-slate-300 text-slate-900"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">경력</label>
            <div className="flex gap-1.5">
              {JOB_TYPE_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => toggleJobType(v)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    jobTypes.includes(v)
                      ? "bg-slate-100 text-slate-700 border-slate-300 text-slate-900"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={!keyword.trim() || status === "running"}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {status === "running" ? <span className="animate-spin">◌</span> : <span>▶</span>}
            liveSearch 실행
          </button>
          {status === "ok" && ms !== null && (
            <span className="text-xs text-slate-400">⏱ {(ms / 1000).toFixed(1)}s · {jobs.length}건</span>
          )}
          {status === "error" && <span className="text-xs text-red-500">오류가 발생했습니다</span>}
        </div>
      </div>

      {/* 로그 */}
      {logs.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">로그</p>
          <div className="space-y-0.5">
            {logs.map((log, i) => (
              <p key={i} className="text-xs text-slate-300 font-mono">{log}</p>
            ))}
          </div>
        </div>
      )}

      {/* 공고 목록 */}
      {jobs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 mb-3">수집된 공고 ({jobs.length}건)</p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {jobs.map((job, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                <span className="text-xs text-slate-400 w-5 shrink-0 pt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-700 hover:underline truncate block">
                    {job.title}
                  </a>
                  <p className="text-xs text-slate-500">
                    {job.company}{job.location ? ` · ${job.location}` : ""}
                  </p>
                  {job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {job.skills.slice(0, 6).map((s, j) => (
                        <span key={j} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI 컨텍스트 */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 mb-2">AI 컨텍스트 (recruitCtx)</p>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
