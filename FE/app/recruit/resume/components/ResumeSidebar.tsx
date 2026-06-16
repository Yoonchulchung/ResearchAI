"use client";

import {
  type DragEvent,
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
  type ResumeTraining,
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
import {
  searchCoverLetterQuestions,
  type CoverLetterQuestionSearchItem,
} from "@/lib/api/recruit/cover-letter";
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
type EvalItemType = "evaluate" | "jd_evaluate" | "spellcheck" | "example";

interface EvalItem {
  subjectKey: string;
  type: EvalItemType;
  title: string;
  result: string;
  loading: boolean;
  error: string | null;
  model: string;
  runToken?: number;
}

interface NewsItemState extends CompanyNewsItem {
  detailResult?: string;
  detailLoading?: boolean;
  detailError?: string | null;
}

function unwrapMarkdownFence(text: string) {
  let value = text.trim();
  if (value.startsWith("```")) {
    value = value.replace(/^```[^\n\r]*(?:\r?\n)?/, "");
    value = value.replace(/\r?\n?```\s*$/, "");
  }
  return value.trim();
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
  onInsertTraining?: (training: ResumeTraining) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Eval Item Card
// ────────────────────────────────────────────────────────────────────────────

function EvalCard({
  item,
  models,
  itemKey,
  open,
  dragging,
  dragOver,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRerun,
  onDelete,
}: {
  item: EvalItem;
  models: { id: string; name: string }[];
  itemKey: string;
  open: boolean;
  dragging: boolean;
  dragOver: boolean;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onRerun: (subjectKey: string, model: string) => void;
  onDelete: (subjectKey: string, type: string) => void;
}) {
  const [selectedModel, setSelectedModel] = useState(item.model);
  const rerunLabel = item.type === "spellcheck" ? "재검사" : item.type === "example" ? "재생성" : "재평가";
  const markdown = unwrapMarkdownFence(item.result);
  const waitingForFirstChunk = item.loading && !item.result;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-eval-key={itemKey}
      className={`flex shrink-0 flex-col rounded-md border bg-white overflow-hidden transition-colors ${open ? "max-h-[calc(100dvh-9rem)]" : ""} ${
        dragging
          ? "border-indigo-300 opacity-60"
          : dragOver
            ? "border-indigo-300 bg-indigo-50/30"
            : "border-slate-200"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="순서 변경"
          className="shrink-0 cursor-grab rounded-sm px-1 py-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
          aria-label={`${item.title} 순서 변경`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2h.01M8 2h.01M4 6h.01M8 6h.01M4 10h.01M8 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={onToggle}
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
                <span key={d} className="w-1 h-1 rounded-sm bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
        </button>
        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={item.loading}
          className="h-6 rounded-sm border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-600 outline-none disabled:opacity-50">
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button onClick={() => onRerun(item.subjectKey, selectedModel)} disabled={item.loading}
          className="shrink-0 flex items-center gap-0.5 h-6 px-1.5 rounded-sm border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M8.5 2A4.5 4.5 0 1 0 9.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M7 0.5L8.5 2L7 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {rerunLabel}
        </button>
        <button onClick={() => onDelete(item.subjectKey, item.type)} disabled={item.loading}
          className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-30">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="min-h-[18rem] min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {item.error ? (
            <p className="text-sm text-red-500">{item.error}</p>
          ) : waitingForFirstChunk ? (
            <div className="flex flex-col gap-2 text-sm text-slate-400">
              <p>연결 중....</p>
              <p className="text-xs text-slate-400">클라우드 AI 응답을 기다리고 있습니다.</p>
            </div>
          ) : !item.result ? (
            <p className="text-sm text-slate-400">생성된 내용이 없습니다.</p>
          ) : (
            <div className={`${PROSE_CLASS} break-words text-sm [&_*]:max-w-full [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              {item.loading && <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-indigo-500 align-middle" />}
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
            className="flex-1 h-7 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-600 outline-none disabled:opacity-50">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={handleRun} disabled={loading || !hasContent}
            className="shrink-0 flex items-center gap-1 h-7 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
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
            {loading && <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-indigo-500 align-middle" />}
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
  onReorder,
}: {
  target: ResumeTarget;
  evals: EvalItem[];
  models: { id: string; name: string }[];
  onUpdate: (subjectKey: string, model: string, content: string, action: string) => void;
  onDelete: (subjectKey: string, type: string) => void;
  onReorder: (fromKey: string, toKey: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const seenRunTokensRef = useRef<Map<string, number>>(new Map());
  const manuallyClosedRunTokensRef = useRef<Map<string, number>>(new Map());
  const buildProfileSectionEvaluationContent = (
    sectionLabel: string,
    fields: Array<[string, string | null | undefined]>,
    description: string,
  ) => {
    const isOverseas = sectionLabel === "해외 활동";
    const base = [
      !isOverseas && target.companyName ? `기업명: ${target.companyName}` : "",
      !isOverseas && target.jobTitle ? `직무: ${target.jobTitle}` : "",
      !isOverseas && target.jd ? `채용공고 JD:\n${target.jd}` : "",
      `평가 대상: ${sectionLabel}`,
      ...fields.map(([label, value]) => value?.trim() ? `${label}: ${value}` : ""),
      `작성 내용:\n${description}`,
    ];
    const request = isOverseas
      ? [
        "요청: 이 항목은 직무 적합도 점수 평가가 아니라 지원자를 소개하는 해외 경험 소재 평가입니다.",
        "기업/JD/직무와 억지로 연결하지 말고, 해외 경험 자체가 지원자를 어떤 사람으로 보여주는지 평가해주세요.",
        "먼저 기업 일반이 해외 활동 항목에서 확인하려는 이유를 추출해주세요. 예: 낯선 환경 적응력과 생존력, 열린 시각과 문화적 다양성, 주도성과 독립성, 글로벌 협업 감각, 언어/문화 장벽을 다루는 방식 등.",
        "그 다음 현재 작성 내용이 위 신호를 얼마나 보여주는지 평가해주세요.",
        "반드시 '추가 추천' 섹션을 만들어, 더 넣으면 좋은 개인 경험 소재를 제안해주세요. 예: 어떤 낯선 문제 상황, 문화 차이, 독립적으로 해결한 일, 현지인/국제 팀과의 소통, 실패 후 적응한 과정, 관점 변화.",
        "완성본 대필보다 작성자가 직접 보강할 수 있는 방향, 질문 목록, 강조 키워드 중심으로 답해주세요.",
      ].join(" ")
      : [
        "요청: 이 항목은 직무 적합도 점수 평가가 아니라 지원자를 소개하는 경험 소재 평가입니다.",
        "이 경험이 어떤 사람으로 보이게 하는지, 강점과 성향이 충분히 드러나는지, 빠진 맥락은 무엇인지 봐주세요.",
        "기업/JD/직무와 연결해 추가하면 좋은 내용, 강조하면 좋은 키워드, 보완 방향을 제안해주세요.",
        "완성본 대필보다 작성자가 직접 고칠 수 있는 방향 중심으로 답해주세요.",
      ].join(" ");
    return [...base, request].filter(Boolean).join("\n\n");
  };

  useEffect(() => {
    if (evals.length === 0) {
      setOpenKey(null);
      seenRunTokensRef.current.clear();
      manuallyClosedRunTokensRef.current.clear();
      return;
    }

    const existingKeys = new Set(evals.map((item) => `${item.subjectKey}-${item.type}`));
    for (const key of seenRunTokensRef.current.keys()) {
      if (!existingKeys.has(key)) seenRunTokensRef.current.delete(key);
    }
    for (const key of manuallyClosedRunTokensRef.current.keys()) {
      if (!existingKeys.has(key)) manuallyClosedRunTokensRef.current.delete(key);
    }

    let newlyStartedItem: EvalItem | undefined;
    for (const item of evals) {
      const itemKey = `${item.subjectKey}-${item.type}`;
      const token = item.runToken ?? 0;
      const previousToken = seenRunTokensRef.current.get(itemKey);
      seenRunTokensRef.current.set(itemKey, token);
      if (previousToken === token || newlyStartedItem) continue;
      const manuallyClosedToken = manuallyClosedRunTokensRef.current.get(itemKey);
      if (manuallyClosedToken === token) continue;
      newlyStartedItem = item;
    }

    if (newlyStartedItem) {
      setOpenKey(`${newlyStartedItem.subjectKey}-${newlyStartedItem.type}`);
      return;
    }

    setOpenKey((current) => {
      if (current === null) return null;
      if (current && existingKeys.has(current)) return current;
      const next = evals[0];
      return `${next.subjectKey}-${next.type}`;
    });
  }, [evals]);

  if (evals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
          <path d="M16 4l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <p className="text-sm text-slate-400">자소서, 학내외활동, 수상, 해외 활동에서<br />AI 도움을 받아보세요.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden bg-slate-50/60">
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 py-4 flex flex-col gap-4">
        {evals.map((item) => {
          const itemKey = `${item.subjectKey}-${item.type}`;
          return (
            <EvalCard
              key={itemKey}
              item={item}
              models={models}
              itemKey={itemKey}
              open={openKey === itemKey}
              dragging={dragKey === itemKey}
              dragOver={dragOverKey === itemKey && dragKey !== itemKey}
              onToggle={() => {
                setOpenKey((current) => {
                  if (current === itemKey) {
                    manuallyClosedRunTokensRef.current.set(itemKey, item.runToken ?? 0);
                    return null;
                  }
                  manuallyClosedRunTokensRef.current.delete(itemKey);
                  return itemKey;
                });
              }}
              onDragStart={(event) => {
                setDragKey(itemKey);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", itemKey);
              }}
              onDragOver={(event) => {
                if (!dragKey || dragKey === itemKey) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverKey(itemKey);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromKey = dragKey ?? event.dataTransfer.getData("text/plain");
                setDragKey(null);
                setDragOverKey(null);
                if (!fromKey || fromKey === itemKey) return;
                onReorder(fromKey, itemKey);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDragOverKey(null);
              }}
              onRerun={(sk, mdl) => {
                manuallyClosedRunTokensRef.current.delete(itemKey);
                setOpenKey(itemKey);
                if (item.type === "spellcheck") {
                  const si = target.selfIntroductions.find((s) => s.id === sk);
                  const experience = target.experiences?.find((entry) => entry.id === sk);
                  const training = target.trainings?.find((entry) => entry.id === sk);
                  const prize = target.prizes?.find((entry) => entry.id === sk);
                  const content =
                    si?.answer ??
                    (sk === `${target.id}-jd` ? target.jd : undefined) ??
                    experience?.description ??
                    training?.description ??
                    prize?.description ??
                    "";
                  if (!content.trim()) return;
                  onUpdate(sk, mdl, content, "spellcheck");
                  return;
                }
                if (item.type === "evaluate") {
                  const experience = target.experiences?.find((entry) => entry.id === sk);
                  const training = target.trainings?.find((entry) => entry.id === sk);
                  const prize = target.prizes?.find((entry) => entry.id === sk);
                  if (experience) {
                    const isOverseas = experience.activityType === "해외 경험";
                    const content = buildProfileSectionEvaluationContent(isOverseas ? "해외 활동" : "학내외활동", isOverseas ? [
                      ["해외경험 목적", experience.role],
                      ["국가", experience.organizationName],
                      ["해외경험 기간", [experience.startDate, experience.endDate].filter(Boolean).join(" ~ ")],
                    ] : [
                      ["활동구분", experience.activityType],
                      ["기관 및 조직명", experience.organizationName],
                      ["활동기간", [experience.startDate, experience.endDate].filter(Boolean).join(" ~ ")],
                      ["역할", experience.role],
                    ], experience.description ?? "");
                    if (!content.trim()) return;
                    onUpdate(sk, mdl, content, "evaluate");
                    return;
                  }
                  if (training) {
                    const content = buildProfileSectionEvaluationContent("교육이수사항", [
                      ["교육명", training.title],
                      ["교육기관명", training.institution],
                      ["이수기간", [training.startDate, training.endDate].filter(Boolean).join(" ~ ")],
                      ["교육시간", training.hours ? `${training.hours}시간` : ""],
                    ], training.description ?? "");
                    if (!content.trim()) return;
                    onUpdate(sk, mdl, content, "evaluate");
                    return;
                  }
                  if (prize) {
                    const content = buildProfileSectionEvaluationContent("수상", [
                      ["상훈명", prize.title],
                      ["수여기관", prize.organization],
                      ["발급일", prize.issuedDate],
                    ], prize.description ?? "");
                    if (!content.trim()) return;
                    onUpdate(sk, mdl, content, "evaluate");
                    return;
                  }
                }
                const si = target.selfIntroductions.find((s) => s.id === sk);
                if (!si) return;
                const content = [
                  target.companyName ? `기업명: ${target.companyName}` : "",
                  target.jobTitle ? `직무: ${target.jobTitle}` : "",
                  target.jd ? `채용공고 JD:\n${target.jd}` : "",
                  item.type === "example"
                    ? `문항:\n${si.question}`
                    : si.question ? `문항: ${si.question}` : "",
                  item.type === "example" && si.answer.trim()
                    ? `현재 작성 중인 답변 초안:\n${si.answer}`
                    : item.type !== "example" ? `답변:\n${si.answer}` : "",
                  item.type === "example"
                    ? "요청: 이 문항에 어떤 방향과 소재로 답변하면 좋은지 알려주세요. 완성본 대필보다 작성자가 직접 쓸 수 있는 구조, 소재 후보, 주의점, 짧은 예시 단락을 중심으로 안내해주세요."
                    : "",
                ].filter(Boolean).join("\n\n");
                onUpdate(sk, mdl, content, item.type);
              }}
              onDelete={onDelete}
            />
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hired Cover Letter Browse Panel
// ────────────────────────────────────────────────────────────────────────────

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function CoverLetterBrowsePanel({
  companyName,
  onInsertSelfIntro,
}: {
  companyName?: string;
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
}) {
  const [query, setQuery] = useState(companyName?.trim() ?? "");
  const [items, setItems] = useState<CoverLetterQuestionSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setQuery(companyName?.trim() ?? "");
  }, [companyName]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchCoverLetterQuestions(query.trim(), 30)
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
          setTotal(res.total);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setTotal(0);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handleInsert = (item: CoverLetterQuestionSearchItem) => {
    onInsertSelfIntro?.({
      id: createLocalId(),
      question: item.question,
      answer: item.answer,
      category: item.tags,
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">합격 자소서 검색</span>
          {total > 0 && <span className="text-xs text-slate-400">{total.toLocaleString()}건</span>}
          {loading && <span className="ml-auto w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-slate-300">
            <path d="M5.8 10.1a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6ZM9.2 9.2l2.3 2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="성장과정, 도전, 협업, 갈등..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-300"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
        {loading ? null : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-slate-200">
              <path d="M5 4h18v20H5V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 9h12M8 13h12M8 17h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-slate-400">검색 결과가 없습니다.</p>
          </div>
        ) : (
          items.map((item) => {
            const coverLetter = item.coverLetter;
            const isOpen = expanded === item.id;
            return (
              <div key={item.id} className="rounded-md border border-slate-200 bg-white">
                <button
                  onClick={() => setExpanded((v) => (v === item.id ? null : item.id))}
                  className="w-full min-h-[76px] flex items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className={`mt-1.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-5 text-slate-800 break-words">{coverLetter.company || "기업명 없음"}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 line-clamp-2 break-words">{item.question || `문항 ${item.number}`}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {coverLetter.position && <span className="text-xs leading-5 text-slate-400 break-words">{coverLetter.position}</span>}
                      {coverLetter.season && <span className="text-xs leading-5 text-slate-400 break-words">{coverLetter.season}</span>}
                      {item.tags?.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs leading-5 px-1.5 rounded-sm bg-indigo-50 text-indigo-600">{tag}</span>
                      ))}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 pb-4 pt-3 flex flex-col gap-3">
                    <p className="text-sm text-slate-700 leading-7 whitespace-pre-wrap">{item.answer}</p>
                    {item.keywords && item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.keywords.slice(0, 10).map((keyword) => (
                          <span key={keyword} className="text-xs px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500">{keyword}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleInsert(item)}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                      >
                        문항 가져오기
                      </button>
                      {coverLetter.url && (
                        <a
                          href={coverLetter.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                          원문 보기
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
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
    <div className="rounded-md border border-slate-100 bg-white overflow-hidden">
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
                <span key={d} className="w-1 h-1 rounded-sm bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
        </button>
        <div className="shrink-0 flex gap-1 mt-0.5">
          <button
            onClick={() => onDeepSearch(item)}
            disabled={item.detailLoading}
            title="세부 검색"
            className="flex items-center gap-0.5 h-6 px-1.5 rounded-sm border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
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
            className="h-8 flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300 disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button onClick={handleSearch} disabled={loading || !hasCompany}
            className="shrink-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40">
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
  { resumeId, target, onInsertSelfIntro, onInsertExperience, onInsertPrize, onInsertTraining },
  ref,
) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>("company");
  const [evals, setEvals] = useState<EvalItem[]>([]);
  const savedEvalsRef = useRef<Map<string, string>>(new Map());
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const evalRunTokenRef = useRef(0);

  const defaultModel = user?.defaultCloudModel ?? MODELS[0]?.id ?? "";
  const latestTargetRef = useRef(target);
  const defaultModelRef = useRef(defaultModel);

  useEffect(() => {
    latestTargetRef.current = target;
  }, [target]);

  useEffect(() => {
    defaultModelRef.current = defaultModel;
  }, [defaultModel]);

  // Load persisted evals for the active resume. Keep this detached from live
  // editor changes so an in-flight AI response is not replaced by saved results.
  useEffect(() => {
    if (!resumeId) {
      savedEvalsRef.current.clear();
      setEvals([]);
      return;
    }
    let cancelled = false;
    const loadTarget = latestTargetRef.current;
    const fallbackModel = defaultModelRef.current;
    savedEvalsRef.current.clear();
    setEvals([]);

    getResumeAiEvals(resumeId).then((list) => {
      if (cancelled) return;
      const evalItems: EvalItem[] = list
        .filter((e) => e.type === "evaluate" || e.type === "spellcheck" || e.type === "example")
        .map((e) => {
          const si = loadTarget.selfIntroductions.find((s) => s.id === e.subjectKey);
          const idx = loadTarget.selfIntroductions.findIndex((s) => s.id === e.subjectKey);
          const experience = loadTarget.experiences?.find((item) => item.id === e.subjectKey);
          const training = loadTarget.trainings?.find((item) => item.id === e.subjectKey);
          const prize = loadTarget.prizes?.find((item) => item.id === e.subjectKey);
          const typeLabel = e.type === "spellcheck" ? " (맞춤법)" : e.type === "example" ? " (작성 방향)" : "";
          const actionLabel = e.type === "spellcheck" ? "맞춤법 검사" : e.type === "example" ? "작성 방향" : "글 평가";
          const fallbackTitle = (() => {
            if (e.subjectKey === `${loadTarget.id}-jd`) return `JD ${actionLabel}`;
            if (experience) {
              return experience.activityType === "해외 경험"
                ? `해외 활동 ${actionLabel}`
                : `학내외활동 ${actionLabel}`;
            }
            if (training) return `교육이수사항 ${actionLabel}`;
            if (prize) return `수상 ${actionLabel}`;
            return `문항 ${idx + 1}${typeLabel}`;
          })();
          return {
            subjectKey: e.subjectKey,
            type: e.type as EvalItemType,
            title: si?.question
              ? `문항 ${idx + 1}: ${si.question.slice(0, 30)}${typeLabel}`
              : fallbackTitle,
            result: e.result,
            loading: false,
            error: null,
            model: e.model ?? fallbackModel,
          };
        });
      setEvals((prev) => {
        const persistedKeys = new Set(evalItems.map((item) => `${item.subjectKey}-${item.type}`));
        const persistedWithActiveRunsPreserved = evalItems.map((item) => {
          const activeItem = prev.find((prevItem) => (
            prevItem.subjectKey === item.subjectKey &&
            prevItem.type === item.type &&
            prevItem.runToken !== undefined
          ));
          return activeItem ?? item;
        });
        const activeOnlyItems = prev.filter((item) => (
          item.runToken !== undefined &&
          !persistedKeys.has(`${item.subjectKey}-${item.type}`)
        ));
        return [...persistedWithActiveRunsPreserved, ...activeOnlyItems];
      });
      for (const e of list) savedEvalsRef.current.set(`${e.subjectKey}-${e.type}`, e.id);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [resumeId]);

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
    const runToken = ++evalRunTokenRef.current;

    setEvals((prev) => {
      const exists = prev.find((e) => e.subjectKey === subjectKey && e.type === itemType);
      if (exists) return prev.map((e) => e.subjectKey === subjectKey && e.type === itemType ? { ...e, result: "", loading: true, error: null, model, runToken } : e);
      return [...prev, { subjectKey, type: itemType, title, result: "", loading: true, error: null, model, runToken }];
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
        if (fullResult) {
          upsertResumeAiEval(resumeId, { subjectKey, type: action, result: fullResult, model })
            .then((saved) => {
              savedEvalsRef.current.set(`${subjectKey}-${action}`, saved.id);
            })
            .catch(() => {});
        }
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

  const handleReorderEval = useCallback((fromKey: string, toKey: string) => {
    setEvals((prev) => {
      const fromIndex = prev.findIndex((item) => `${item.subjectKey}-${item.type}` === fromKey);
      const toIndex = prev.findIndex((item) => `${item.subjectKey}-${item.type}` === toKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  return (
    <div className="hidden md:flex flex-col w-96 xl:w-105 shrink-0 border-l border-slate-100 print:hidden">
      {/* Horizontally scrollable tabs */}
      <div className="shrink-0 flex border-b border-slate-100 bg-white overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2.5 text-xs2 font-semibold transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab.id ? "text-indigo-600 border-indigo-500" : "text-slate-400 border-transparent hover:text-slate-600"
            }`}>
            {tab.label}
            {tab.id === "eval" && evals.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-sm bg-indigo-100 text-indigo-600 text-micro font-bold">
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
            onReorder={handleReorderEval}
          />
        </div>
        <div className={`absolute inset-0 ${activeTab === "search" ? "flex flex-col" : "hidden"}`}>
          <ResumeSearchPanel
            onInsertSelfIntro={onInsertSelfIntro}
            onInsertExperience={onInsertExperience}
            onInsertPrize={onInsertPrize}
            onInsertTraining={onInsertTraining}
          />
        </div>
        <div className={`absolute inset-0 ${activeTab === "covers" ? "flex flex-col" : "hidden"}`}>
          <CoverLetterBrowsePanel companyName={target.companyName} onInsertSelfIntro={onInsertSelfIntro} />
        </div>
        <div className={`absolute inset-0 ${activeTab === "news" ? "flex flex-col" : "hidden"}`}>
          <CompanyNewsPanel target={target} resumeId={resumeId} />
        </div>
      </div>
    </div>
  );
});

export default ResumeSidebar;
