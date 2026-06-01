"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  listCompanyAnalyses,
  getCompanyAnalysis,
  analyzeCompanyStream,
  type CompanyAnalysis,
  type AnalyzeProgressEvent,
} from "@/lib/api/company-analysis";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS, PROSE_CLASS } from "@/recruit/_constants";

function CompanyDetailInline({
  company,
  onBack,
}: {
  company: CompanyAnalysis;
  onBack: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <button
          onClick={onBack}
          className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L5 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 truncate">{company.companyName}</p>
          {company.industry && (
            <span className="text-2xs text-violet-600 font-semibold">{company.industry}</span>
          )}
        </div>
        <a
          href={`/companies/analysis?company=${encodeURIComponent(company.companyName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
          title="새 탭에서 보기"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 10.5L10.5 1.5M10.5 1.5H5M10.5 1.5V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-5 text-sm text-slate-600">
        {/* Summary */}
        {company.summary && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">요약</p>
            <p className="leading-relaxed text-sm text-slate-700">{company.summary}</p>
          </div>
        )}

        {/* Report (markdown) */}
        {company.report && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">분석 리포트</p>
            <div className={`${PROSE_CLASS} text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{company.report}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* SWOT */}
        {company.swot && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">SWOT</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["S", "W", "O", "T"] as const).map((key) => {
                const labels = { S: "강점", W: "약점", O: "기회", T: "위협" };
                const colors = {
                  S: "bg-emerald-50 text-emerald-700 border-emerald-100",
                  W: "bg-red-50 text-red-700 border-red-100",
                  O: "bg-blue-50 text-blue-700 border-blue-100",
                  T: "bg-amber-50 text-amber-700 border-amber-100",
                };
                const items = company.swot![key] ?? [];
                if (!items.length) return null;
                return (
                  <div key={key} className={`rounded-lg border p-2.5 ${colors[key]}`}>
                    <p className="text-xs font-bold uppercase mb-1.5">{labels[key]}</p>
                    <ul className="space-y-1">
                      {items.slice(0, 3).map((item, i) => (
                        <li key={i} className="text-xs leading-snug">· {item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mission / Vision */}
        {company.missionVision && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">미션 / 비전</p>
            <div className="flex flex-col gap-1.5">
              {company.missionVision.mission && (
                <p className="text-sm leading-relaxed"><span className="font-semibold text-slate-500">미션 </span>{company.missionVision.mission}</p>
              )}
              {company.missionVision.vision && (
                <p className="text-sm leading-relaxed"><span className="font-semibold text-slate-500">비전 </span>{company.missionVision.vision}</p>
              )}
              {company.missionVision.talentProfile && (
                <p className="text-sm leading-relaxed"><span className="font-semibold text-slate-500">인재상 </span>{company.missionVision.talentProfile}</p>
              )}
              {company.missionVision.coreValues?.length > 0 && (
                <p className="text-sm leading-relaxed"><span className="font-semibold text-slate-500">핵심가치 </span>{company.missionVision.coreValues.join(", ")}</p>
              )}
            </div>
          </div>
        )}

        {/* Recent news */}
        {company.recentNews && company.recentNews.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">최근 뉴스</p>
            <div className="flex flex-col gap-1.5">
              {company.recentNews.slice(0, 5).map((news, i) => (
                <a
                  key={i}
                  href={news.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-0.5 rounded-lg border border-slate-100 px-2.5 py-2 hover:border-slate-200 transition-colors"
                >
                  <p className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 leading-snug line-clamp-2 transition-colors">{news.title}</p>
                  <p className="text-xs text-slate-400">{news.date}</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type AnalyzeState = {
  running: boolean;
  log: string;
  error: string | null;
};

export default function CompanyAnalysisPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const { user } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const [companies, setCompanies] = useState<CompanyAnalysis[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyAnalysis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyze, setAnalyze] = useState<AnalyzeState>({ running: false, log: "", error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    listCompanyAnalyses()
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setListLoading(false));
  }, []);

  // Sync initialQuery changes (e.g. user edits company name field)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const filtered = query.trim()
    ? companies.filter((c) => c.companyName.toLowerCase().includes(query.trim().toLowerCase()))
    : companies;

  const handleView = async (company: CompanyAnalysis) => {
    setDetailLoading(true);
    try {
      const detail = await getCompanyAnalysis(company.companyKey);
      setSelected(detail);
    } catch {
      setSelected(company);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAnalyze = async (companyName: string) => {
    if (!companyName.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnalyze({ running: true, log: "분석 요청 중...", error: null });

    try {
      const model = user?.defaultCloudModel ?? MODELS[0].id;
      let result: CompanyAnalysis | null = null;
      await analyzeCompanyStream(
        companyName.trim(),
        model,
        (event: AnalyzeProgressEvent) => {
          if (event.type === "log") setAnalyze((p) => ({ ...p, log: event.message }));
          else if (event.type === "done") result = event.result;
          else if (event.type === "error") setAnalyze((p) => ({ ...p, error: event.message }));
        },
        ctrl.signal,
      );
      if (result) {
        setCompanies((prev) => {
          const exists = prev.find((c) => c.companyKey === (result as CompanyAnalysis).companyKey);
          return exists ? prev.map((c) => c.companyKey === (result as CompanyAnalysis).companyKey ? result! : c) : [result!, ...prev];
        });
        setSelected(result);
      }
      setAnalyze({ running: false, log: "", error: null });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setAnalyze({ running: false, log: "", error: e instanceof Error ? e.message : "분석에 실패했습니다." });
      } else {
        setAnalyze({ running: false, log: "", error: null });
      }
    }
  };

  if (selected) {
    return <CompanyDetailInline company={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="기업명 검색"
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </div>
        {/* Analyze button — shown when query is set */}
        {query.trim() && (
          <button
            onClick={() => handleAnalyze(query)}
            disabled={analyze.running}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-indigo-200 bg-indigo-50 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            {analyze.running ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
                {analyze.log || "분석 중..."}
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5 3v2l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                &quot;{query.trim()}&quot; 기업 분석 시작
              </>
            )}
          </button>
        )}
        {analyze.error && (
          <p className="text-[11px] text-red-500">{analyze.error}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {listLoading || detailLoading ? (
          <div className="flex items-center justify-center py-10">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">
            {query.trim() ? "검색 결과가 없습니다." : "분석된 기업이 없습니다."}
          </p>
        ) : (
          filtered.map((company) => (
            <div key={company.companyKey} className="rounded-xl border border-slate-100 bg-white p-3 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 truncate">{company.companyName}</p>
                  {company.industry && (
                    <span className="inline-block mt-1 rounded px-1.5 py-0.5 text-2xs font-bold bg-violet-50 text-violet-600">
                      {company.industry}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleView(company)}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                >
                  보기
                </button>
              </div>
              {company.summary && (
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{company.summary}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
