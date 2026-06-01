"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamWriteAssist } from "@/lib/api/ai";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import {
  getResumeAiEvals,
  upsertResumeAiEval,
  deleteResumeAiEval,
  type ResumeAiEval,
  type ResumeExperience,
  type ResumePrize,
  type ResumeTarget,
  type ResumeSelfIntro,
} from "@/lib/api/resume";
import {
  getCompanyJdEval,
  upsertCompanyJdEval,
  getCompanyNews,
  upsertCompanyNewsItem,
  deepSearchCompanyNewsItem,
  deleteCompanyNews,
  deleteCompanyNewsByResume,
  type CompanyJdEval,
  type CompanyNewsItem,
} from "@/lib/api/recruit/company-news";
import { getCompanyAnalysis } from "@/lib/api/company-analysis";
import { listCoverLetters, type CoverLetter } from "@/lib/api/recruit/cover-letter";
import { enqueueLightResearch, subscribeLightResearch, type LightResearchEvent } from "@/lib/api/research";
import type { Task } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS, PROSE_CLASS } from "@/recruit/_constants";
import CompanyAnalysisPanel from "./CompanyAnalysisPanel";
import ResumeSearchPanel from "../write/components/ResumeSearchPanel";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type SidebarTab = "company" | "jd" | "eval" | "search" | "covers" | "news";
type EvalItemType = "evaluate" | "jd_evaluate" | "spellcheck";

interface EvalItem {
  subjectKey: string;
  type: EvalItemType;
  title: string;
  result: string;
  loading: boolean;
  error: string | null;
  model: string;
}

interface NewsItemState extends CompanyNewsItem {
  detailResult?: string;
  detailLoading?: boolean;
  detailError?: string | null;
}

export interface ResumeSidebarRef {
  startEval: (subjectKey: string, title: string, content: string, model: string, action?: string) => void;
}

interface Props {
  resumeId: string;
  target: ResumeTarget;
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
  onInsertExperience?: (exp: ResumeExperience) => void;
  onInsertPrize?: (prize: ResumePrize) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Eval Item Card
// ────────────────────────────────────────────────────────────────────────────

function EvalCard({
  item,
  models,
  onRerun,
  onDelete,
}: {
  item: EvalItem;
  models: { id: string; name: string }[];
  onRerun: (subjectKey: string, model: string) => void;
  onDelete: (subjectKey: string, type: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState(item.model);

  return (
    <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/60">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-slate-700 truncate">{item.title}</span>
          {item.loading && (
            <span className="shrink-0 flex gap-0.5">
              {[0, 120, 240].map((d) => (
                <span key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
        </button>
        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={item.loading}
          className="h-6 rounded border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-600 outline-none disabled:opacity-50">
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button onClick={() => onRerun(item.subjectKey, selectedModel)} disabled={item.loading}
          className="shrink-0 flex items-center gap-0.5 h-6 px-1.5 rounded border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M8.5 2A4.5 4.5 0 1 0 9.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M7 0.5L8.5 2L7 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          재평가
        </button>
        <button onClick={() => onDelete(item.subjectKey, item.type)} disabled={item.loading}
          className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-30">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="px-3 py-2 max-h-[50vh] overflow-y-auto">
          {item.error ? (
            <p className="text-sm text-red-500">{item.error}</p>
          ) : !item.result ? (
            <p className="text-sm text-slate-400">생성 중...</p>
          ) : (
            <div className={`${PROSE_CLASS} text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.result}</ReactMarkdown>
              {item.loading && <span className="inline-block h-3.5 w-0.5 animate-pulse rounded bg-indigo-500 align-middle" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// JD Eval Panel  (uses recruit_resume_company_jd entity)
// ────────────────────────────────────────────────────────────────────────────

function JdEvalPanel({
  target,
  resumeId,
  models,
}: {
  target: ResumeTarget;
  resumeId: string;
  models: { id: string; name: string }[];
}) {
  const { user } = useAuth();
  const defaultModel = user?.defaultCloudModel ?? models[0]?.id ?? "";
  const [model, setModel] = useState(defaultModel);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load existing JD eval from DB
  useEffect(() => {
    if (!resumeId) return;
    getCompanyJdEval(resumeId).then((ev) => {
      if (ev?.result) setResult(ev.result);
    }).catch(() => {});
  }, [resumeId]);

  const handleRun = useCallback(async () => {
    if (!target.jd?.trim() && !target.companyName?.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setResult("");

    let companyCtx = "";
    if (target.companyName?.trim()) {
      try {
        const key = target.companyName.trim().toLowerCase().replace(/\s+/g, "_");
        const analysis = await getCompanyAnalysis(key);
        if (analysis) {
          const parts: string[] = [];
          if (analysis.industry) parts.push(`산업: ${analysis.industry}`);
          if (analysis.summary) parts.push(`기업 요약: ${analysis.summary}`);
          if (analysis.companyProfile?.businessArea) parts.push(`사업 영역: ${analysis.companyProfile.businessArea}`);
          if (analysis.missionVision?.mission) parts.push(`미션: ${analysis.missionVision.mission}`);
          if (analysis.missionVision?.vision) parts.push(`비전: ${analysis.missionVision.vision}`);
          if (analysis.swot) {
            const s = analysis.swot.S?.slice(0, 2).join(", ");
            if (s) parts.push(`강점: ${s}`);
          }
          companyCtx = parts.join("\n");
        }
      } catch { /* ignore */ }
    }

    const content = [
      target.companyName ? `기업명: ${target.companyName}` : "",
      target.jobTitle ? `직무: ${target.jobTitle}` : "",
      target.jd ? `\n채용공고 JD:\n${target.jd}` : "",
    ].filter(Boolean).join("\n");

    try {
      let fullResult = "";
      const { jobId } = await enqueueRecruitAssist("jd_evaluate", content, model, undefined, companyCtx);
      await streamWriteAssist(jobId, (event) => {
        if (ctrl.signal.aborted) return;
        if (event.type === "chunk") { setResult((p) => p + event.text); fullResult += event.text; }
        else if (event.type === "error") setError(event.message || "오류가 발생했습니다.");
      }, ctrl.signal);
      if (!ctrl.signal.aborted && fullResult) {
        await upsertCompanyJdEval(resumeId, {
          companyName: target.companyName ?? "",
          jdText: target.jd ?? "",
          result: fullResult,
          model,
        });
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "JD 분석 중 오류가 발생했습니다.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [target, resumeId, model]);

  const hasContent = !!(target.jd?.trim() || target.companyName?.trim());

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        {target.companyName && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-slate-700">{target.companyName}</span>
            {target.jobTitle && <span className="text-sm text-slate-400">· {target.jobTitle}</span>}
          </div>
        )}
        <div className="flex gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={loading}
            className="flex-1 h-7 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-600 outline-none disabled:opacity-50">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={handleRun} disabled={loading || !hasContent}
            className="shrink-0 flex items-center gap-1 h-7 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
            {loading ? <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" /> : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3.5 5h3M5 3.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
            {result ? "재분석" : "JD 분석 시작"}
          </button>
        </div>
        {!hasContent && <p className="text-xs text-slate-400">JD 또는 기업명을 입력하면 분석할 수 있습니다.</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : !result && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <rect x="4" y="4" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 11h14M9 16h10M9 21h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-400">산업 분석, 주요 업무, 핵심 키워드를<br />AI로 분석합니다.</p>
          </div>
        ) : (
          <div className={`${PROSE_CLASS} text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
            {loading && <span className="inline-block h-3.5 w-0.5 animate-pulse rounded bg-indigo-500 align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Eval List Panel
// ────────────────────────────────────────────────────────────────────────────

function EvalListPanel({
  target,
  evals,
  models,
  onUpdate,
  onDelete,
}: {
  target: ResumeTarget;
  evals: EvalItem[];
  models: { id: string; name: string }[];
  onUpdate: (subjectKey: string, model: string, content: string, action: string) => void;
  onDelete: (subjectKey: string, type: string) => void;
}) {
  if (evals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
          <path d="M16 4l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <p className="text-sm text-slate-400">자소서 항목에서 &ldquo;글 평가&rdquo; 버튼을 눌러<br />평가를 시작해보세요.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {evals.map((item) => (
          <EvalCard
            key={`${item.subjectKey}-${item.type}`}
            item={item}
            models={models}
            onRerun={(sk, mdl) => {
              if (item.type === "spellcheck") {
                const si = target.selfIntroductions.find((s) => s.id === sk);
                onUpdate(sk, mdl, si?.answer ?? "", "spellcheck");
                return;
              }
              const si = target.selfIntroductions.find((s) => s.id === sk);
              if (!si) return;
              const content = [
                target.companyName ? `기업명: ${target.companyName}` : "",
                target.jobTitle ? `직무: ${target.jobTitle}` : "",
                target.jd ? `JD:\n${target.jd}` : "",
                si.question ? `문항: ${si.question}` : "",
                `답변:\n${si.answer}`,
              ].filter(Boolean).join("\n\n");
              onUpdate(sk, mdl, content, "evaluate");
            }}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hired Cover Letter Browse Panel
// ────────────────────────────────────────────────────────────────────────────

function CoverLetterBrowsePanel({ companyName }: { companyName?: string }) {
  const [items, setItems] = useState<CoverLetter[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!companyName?.trim()) { setItems([]); setTotal(0); return; }
    setLoading(true);
    listCoverLetters(1, 50, { search: companyName.trim(), sort: "latest" })
      .then((res) => { setItems(res.items); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyName]);

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-slate-100 flex items-center gap-2">
        <span className="text-sm font-bold text-slate-700 truncate">{companyName || "기업명 없음"}</span>
        {total > 0 && <span className="text-xs text-slate-400">{total.toLocaleString()}건</span>}
        {loading && <span className="ml-auto w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {!companyName?.trim() ? (
          <p className="text-sm text-slate-400 text-center py-10">기업명을 입력하면<br />합격 자소서를 검색합니다.</p>
        ) : loading ? null : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-slate-200">
              <path d="M5 4h18v20H5V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 9h12M8 13h12M8 17h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-slate-400">합격 자소서가 없습니다.</p>
          </div>
        ) : (
          items.map((cl) => (
            <div key={cl.id} className="rounded-xl border border-slate-100 bg-white overflow-hidden">
              <button
                onClick={() => setExpanded((v) => (v === cl.id ? null : cl.id))}
                className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${expanded === cl.id ? "rotate-90" : ""}`}>
                  <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-800 truncate">{cl.position || cl.company}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cl.season && <span className="text-sm text-slate-400">{cl.season}</span>}
                    {cl.companyType && <span className="text-sm px-1.5 rounded bg-slate-100 text-slate-500">{cl.companyType}</span>}
                    {cl.source === "catch" ? (
                      <span className="text-sm px-1.5 rounded bg-sky-50 text-sky-600">캐치</span>
                    ) : (
                      <span className="text-sm px-1.5 rounded bg-emerald-50 text-emerald-600">링커리어</span>
                    )}
                    <span className="text-sm text-slate-400">{cl.questions.length}문항</span>
                  </div>
                </div>
              </button>
              {expanded === cl.id && cl.questions.length > 0 && (
                <div className="border-t border-slate-100 px-3 pb-4 pt-3 flex flex-col gap-5">
                  {cl.questions.map((q, i) => (
                    <div key={i}>
                      <p className="text-sm font-semibold text-slate-600 leading-snug mb-2">{q.number}. {q.question}</p>
                      <p className="text-base text-slate-700 leading-8 whitespace-pre-wrap">{q.answer}</p>
                    </div>
                  ))}
                  <a
                    href={cl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
                  >
                    원문 보기
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M1 8L8 1M8 1H3M8 1v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Company News Panel (with DB persistence + per-item deep search)
// ────────────────────────────────────────────────────────────────────────────

function NewsItemCard({
  item,
  onDeepSearch,
  onDelete,
}: {
  item: NewsItemState;
  onDeepSearch: (item: NewsItemState) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 flex items-start gap-1.5 text-left">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</span>
          {item.detailLoading && (
            <span className="shrink-0 mt-0.5 flex gap-0.5">
              {[0, 120, 240].map((d) => (
                <span key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
        </button>
        <div className="shrink-0 flex gap-1 mt-0.5">
          <button
            onClick={() => onDeepSearch(item)}
            disabled={item.detailLoading}
            title="세부 검색"
            className="flex items-center gap-0.5 h-6 px-1.5 rounded border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <circle cx="4.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 7l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M4.5 3v3M3 4.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            세부 검색
          </button>
          <button onClick={() => onDelete(item.id)}
            className="text-slate-300 hover:text-red-400 transition-colors">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          {item.detailError ? (
            <p className="text-sm text-red-500">{item.detailError}</p>
          ) : item.detailLoading ? (
            <p className="text-sm text-slate-400">AI 웹 검색 중...</p>
          ) : item.detailResult ? (
            <div className={`${PROSE_CLASS} text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.detailResult}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              &ldquo;세부 검색&rdquo; 버튼을 눌러 구체적인 내용을 찾아보세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CompanyNewsPanel({ target, resumeId }: { target: ResumeTarget; resumeId: string }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NewsItemState[]>([]);
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(() => user?.defaultCloudModel ?? MODELS[0].id);
  const abortRef = useRef<AbortController | null>(null);
  const deepAbortRefs = useRef<Map<string, AbortController>>(new Map());

  // Load saved news from DB on mount
  useEffect(() => {
    if (!resumeId || !target.companyName) return;
    getCompanyNews(resumeId, target.companyName).then((rows) => {
      if (!rows.length) return;
      setItems(rows.map((row) => ({
        ...row,
        detailResult: row.detailJson ?? undefined,
      })));
    }).catch(() => {});
  }, [resumeId, target.companyName]);

  const handleSearch = useCallback(async () => {
    if (!target.companyName?.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setLog("");

    try {
      const topic = `${target.companyName} 최신 뉴스 및 동향`;
      const { searchId } = await enqueueLightResearch({ topic, localAIModel: "", cloudAIModel: selectedModel, webModel: selectedModel, searchMode: "web" });

      let doneTasks: Task[] = [];
      await subscribeLightResearch(searchId, (event: LightResearchEvent) => {
        if (ctrl.signal.aborted) return;
        if (event.type === "log") setLog(event.message);
        if (event.type === "done") { doneTasks = event.tasks; setLoading(false); }
      }, ctrl.signal);

      if (ctrl.signal.aborted) return;

      // Clear previous news for this resume+company
      if (resumeId && target.companyName) {
        await deleteCompanyNewsByResume(resumeId, target.companyName).catch(() => {});
      }

      // Save each task to DB
      const saved: NewsItemState[] = [];
      for (let i = 0; i < doneTasks.length; i++) {
        const t = doneTasks[i];
        const itemId = t.itemId ?? String(i);
        try {
          const row = await upsertCompanyNewsItem(resumeId, {
            companyName: target.companyName,
            itemId,
            title: t.title,
            searchQuery: t.webSearchPrompt ?? t.title,
            searchId,
          });
          saved.push({ ...row, detailResult: undefined });
        } catch {
          saved.push({
            id: itemId, resumeId, companyName: target.companyName,
            searchId, itemId, title: t.title,
            searchQuery: t.webSearchPrompt ?? t.title,
            detailJson: null, createdAt: "", updatedAt: "",
          });
        }
      }
      setItems(saved);
    } catch (e) {
      if (!ctrl.signal.aborted) { setError(e instanceof Error ? e.message : "뉴스 검색 중 오류가 발생했습니다."); setLoading(false); }
    }
  }, [target.companyName, selectedModel, resumeId]);

  const handleDeepSearch = useCallback(async (item: NewsItemState) => {
    deepAbortRefs.current.get(item.id)?.abort();
    const ctrl = new AbortController();
    deepAbortRefs.current.set(item.id, ctrl);

    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, detailLoading: true, detailError: null } : it));

    try {
      const result = await deepSearchCompanyNewsItem(
        item.id,
        { query: item.searchQuery || item.title, model: selectedModel },
        ctrl.signal,
      );

      if (ctrl.signal.aborted) return;

      setItems((prev) => prev.map((it) =>
        it.id === item.id ? { ...it, detailResult: result.aiResult, detailLoading: false, detailError: null } : it,
      ));
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const msg = e instanceof Error ? e.message : "세부 검색 중 오류";
        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, detailLoading: false, detailError: msg } : it));
      }
    }
  }, [selectedModel]);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    deleteCompanyNews(id).catch(() => {});
  }, []);

  const hasCompany = !!target.companyName?.trim();

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        {target.companyName && <span className="text-sm font-bold text-slate-700">{target.companyName}</span>}
        <div className="flex gap-1.5">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loading}
            className="h-8 flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300 disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button onClick={handleSearch} disabled={loading || !hasCompany}
            className="shrink-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
            {loading ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
                {log ? <span className="truncate max-w-20">{log}</span> : "검색 중..."}
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                {items.length > 0 ? "재검색" : "검색"}
              </>
            )}
          </button>
        </div>
        {!hasCompany && <p className="text-xs text-slate-400">기업명을 입력하면 뉴스를 검색할 수 있습니다.</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : items.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <rect x="3" y="5" width="26" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 11h16M8 16h12M8 21h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-400">기업 관련 최신 뉴스를<br />AI로 검색합니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <NewsItemCard
                key={item.id}
                item={item}
                onDeepSearch={handleDeepSearch}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Sidebar
// ────────────────────────────────────────────────────────────────────────────

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "company", label: "기업 분석" },
  { id: "jd", label: "JD 평가" },
  { id: "eval", label: "글 평가" },
  { id: "search", label: "경험" },
  { id: "covers", label: "합격 자소서" },
  { id: "news", label: "기업 뉴스" },
];

const ResumeSidebar = forwardRef<ResumeSidebarRef, Props>(function ResumeSidebar(
  { resumeId, target, onInsertSelfIntro, onInsertExperience, onInsertPrize },
  ref,
) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>("company");
  const [evals, setEvals] = useState<EvalItem[]>([]);
  const savedEvalsRef = useRef<Map<string, string>>(new Map());
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const defaultModel = user?.defaultCloudModel ?? MODELS[0]?.id ?? "";

  // Load persisted evals on mount
  useEffect(() => {
    if (!resumeId) return;
    getResumeAiEvals(resumeId).then((list) => {
      const evalItems: EvalItem[] = list
        .filter((e) => e.type === "evaluate" || e.type === "spellcheck")
        .map((e) => {
          const si = target.selfIntroductions.find((s) => s.id === e.subjectKey);
          const idx = target.selfIntroductions.findIndex((s) => s.id === e.subjectKey);
          const typeLabel = e.type === "spellcheck" ? " (맞춤법)" : "";
          return {
            subjectKey: e.subjectKey,
            type: e.type as EvalItemType,
            title: si?.question
              ? `문항 ${idx + 1}: ${si.question.slice(0, 30)}${typeLabel}`
              : `문항 ${idx + 1}${typeLabel}`,
            result: e.result,
            loading: false,
            error: null,
            model: e.model ?? defaultModel,
          };
        });
      setEvals(evalItems);
      for (const e of list) savedEvalsRef.current.set(`${e.subjectKey}-${e.type}`, e.id);
    }).catch(() => {});
  }, [resumeId, target, defaultModel]);

  const runEval = useCallback(async (
    subjectKey: string,
    title: string,
    content: string,
    model: string,
    action: string = "evaluate",
  ) => {
    const itemType = action as EvalItemType;
    abortRefs.current.get(`${subjectKey}-${action}`)?.abort();
    const ctrl = new AbortController();
    abortRefs.current.set(`${subjectKey}-${action}`, ctrl);

    setEvals((prev) => {
      const exists = prev.find((e) => e.subjectKey === subjectKey && e.type === itemType);
      if (exists) return prev.map((e) => e.subjectKey === subjectKey && e.type === itemType ? { ...e, result: "", loading: true, error: null, model } : e);
      return [...prev, { subjectKey, type: itemType, title, result: "", loading: true, error: null, model }];
    });

    let fullResult = "";
    try {
      const { jobId } = await enqueueRecruitAssist(action, content, model);
      await streamWriteAssist(jobId, (event) => {
        if (ctrl.signal.aborted) return;
        if (event.type === "chunk") {
          setEvals((prev) => prev.map((e) => e.subjectKey === subjectKey && e.type === itemType ? { ...e, result: e.result + event.text } : e));
          fullResult += event.text;
        } else if (event.type === "error") {
          setEvals((prev) => prev.map((e) => e.subjectKey === subjectKey && e.type === itemType ? { ...e, error: event.message || "오류", loading: false } : e));
        }
      }, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setEvals((prev) => prev.map((e) => e.subjectKey === subjectKey && e.type === itemType ? { ...e, loading: false } : e));
        if (fullResult) upsertResumeAiEval(resumeId, { subjectKey, type: action, result: fullResult, model }).catch(() => {});
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setEvals((prev) => prev.map((ev) => ev.subjectKey === subjectKey && ev.type === itemType ? { ...ev, error: e instanceof Error ? e.message : "오류", loading: false } : ev));
      }
    }
  }, [resumeId]);

  useImperativeHandle(ref, () => ({
    startEval(subjectKey, title, content, model, action = "evaluate") {
      setActiveTab("eval");
      runEval(subjectKey, title, content, model, action);
    },
  }), [runEval]);

  const handleDeleteEval = useCallback((subjectKey: string, type: string) => {
    setEvals((prev) => prev.filter((e) => !(e.subjectKey === subjectKey && e.type === type)));
    const key = `${subjectKey}-${type}`;
    const dbId = savedEvalsRef.current.get(key);
    if (dbId) { deleteResumeAiEval(dbId).catch(() => {}); savedEvalsRef.current.delete(key); }
  }, []);

  return (
    <div className="hidden md:flex flex-col w-96 xl:w-105 shrink-0 border-l border-slate-100">
      {/* Horizontally scrollable tabs */}
      <div className="shrink-0 flex border-b border-slate-100 bg-white overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2.5 text-xs2 font-semibold transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab.id ? "text-indigo-600 border-indigo-500" : "text-slate-400 border-transparent hover:text-slate-600"
            }`}>
            {tab.label}
            {tab.id === "eval" && evals.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-micro font-bold">
                {evals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels — always mounted, hidden when inactive */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeTab === "company" ? "flex flex-col" : "hidden"}`}>
          <CompanyAnalysisPanel initialQuery={target.companyName ?? ""} />
        </div>
        <div className={`absolute inset-0 ${activeTab === "jd" ? "flex flex-col" : "hidden"}`}>
          <JdEvalPanel target={target} resumeId={resumeId} models={MODELS} />
        </div>
        <div className={`absolute inset-0 ${activeTab === "eval" ? "flex flex-col" : "hidden"}`}>
          <EvalListPanel
            target={target}
            evals={evals}
            models={MODELS}
            onUpdate={(sk, mdl, content, action) => {
              const item = evals.find((e) => e.subjectKey === sk);
              runEval(sk, item?.title ?? "", content, mdl, action);
            }}
            onDelete={handleDeleteEval}
          />
        </div>
        <div className={`absolute inset-0 ${activeTab === "search" ? "flex flex-col" : "hidden"}`}>
          <ResumeSearchPanel
            onInsertSelfIntro={onInsertSelfIntro}
            onInsertExperience={onInsertExperience}
            onInsertPrize={onInsertPrize}
          />
        </div>
        <div className={`absolute inset-0 ${activeTab === "covers" ? "flex flex-col" : "hidden"}`}>
          <CoverLetterBrowsePanel companyName={target.companyName} />
        </div>
        <div className={`absolute inset-0 ${activeTab === "news" ? "flex flex-col" : "hidden"}`}>
          <CompanyNewsPanel target={target} resumeId={resumeId} />
        </div>
      </div>
    </div>
  );
});

export default ResumeSidebar;
