"use client";

import { useState, useEffect } from "react";
import {
  testPipelineStep0,
  testPipelineStep1a,
  testPipelineStep1b,
  testPipelineStep2,
  SearchPlan,
  JobItem,
} from "@/lib/api";
import { ModelDefinition } from "@/types";
import { NodeCard } from "../components/NodeCard";
import { NodeState } from "../components/types";
import { VConnector, FanOut, FanIn } from "../components/Connectors";

function initNode(): NodeState {
  return { status: "idle", expanded: false };
}

function logsToResult(logs: string[]): string {
  return logs.join("\n");
}

export function PipelineDiagram({
  apiModels,
  localModels,
}: {
  apiModels: ModelDefinition[];
  localModels: ModelDefinition[];
}) {
  const [topic, setTopic] = useState("");
  const [localModel, setLocalModel] = useState(localModels[0]?.id ?? "");
  const [cloudModel, setCloudModel] = useState(apiModels[0]?.id ?? "");

  useEffect(() => {
    if (apiModels.length > 0 && !cloudModel) setCloudModel(apiModels[0].id);
  }, [apiModels]);

  useEffect(() => {
    if (localModels.length > 0 && !localModel) setLocalModel(localModels[0].id);
  }, [localModels]);
  const [runningAll, setRunningAll] = useState(false);

  const [step0, setStep0] = useState<NodeState>(initNode());
  const [step1a, setStep1a] = useState<NodeState>(initNode());
  const [step1b, setStep1b] = useState<NodeState>(initNode());
  const [step2, setStep2] = useState<NodeState>(initNode());

  const [searchPlan, setSearchPlan] = useState<SearchPlan | null>(null);
  const [webContext, setWebContext] = useState<string | undefined>();
  const [recruitCtx, setRecruitCtx] = useState<string | undefined>();

  const canRun1a = !!searchPlan && (searchPlan.searchMode === "web" || searchPlan.searchMode === "both");
  const canRun1b = !!searchPlan && (searchPlan.searchMode === "recruit" || searchPlan.searchMode === "both");
  const canRun2 = !!searchPlan;
  const showBothRow = searchPlan?.searchMode === "both";
  const showOnlyRecruit = searchPlan?.searchMode === "recruit";

  function planSummary(plan: SearchPlan, logs: string[]) {
    return [
      `모드: ${plan.searchMode}`,
      `키워드: ${plan.keyword}`,
      `이유: ${plan.reason}`,
      plan.companyTypes?.length ? `기업유형: ${plan.companyTypes.join(", ")}` : "",
      plan.jobTypes?.length ? `경력: ${plan.jobTypes.join(", ")}` : "",
      "",
      ...logs,
    ].filter(Boolean).join("\n");
  }

  async function runStep0() {
    if (!topic.trim()) return;
    const t0 = Date.now();
    setStep0({ status: "running", expanded: false });
    setSearchPlan(null); setWebContext(undefined); setRecruitCtx(undefined);
    setStep1a(initNode()); setStep1b(initNode()); setStep2(initNode());
    try {
      const res = await testPipelineStep0(topic.trim(), localModel);
      setSearchPlan(res.searchPlan);
      setStep0({ status: "ok", result: planSummary(res.searchPlan, res.logs), ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setStep0({ status: "error", error: e instanceof Error ? e.message : "플랜 실패", ms: Date.now() - t0, expanded: false });
    }
  }

  async function runStep1a() {
    if (!searchPlan) return;
    const t0 = Date.now();
    setStep1a({ status: "running", expanded: false });
    setWebContext(undefined);
    try {
      const res = await testPipelineStep1a(searchPlan.keyword);
      setWebContext(res.webContext);
      setStep1a({
        status: "ok",
        result: res.webContext
          ? `[${res.webContext.length.toLocaleString()}자 수집]\n\n${logsToResult(res.logs)}`
          : logsToResult(res.logs),
        ms: Date.now() - t0,
        expanded: true,
      });
    } catch (e: unknown) {
      setStep1a({ status: "error", error: e instanceof Error ? e.message : "웹 검색 실패", ms: Date.now() - t0, expanded: false });
    }
  }

  async function runStep1b() {
    if (!searchPlan) return;
    const t0 = Date.now();
    setStep1b({ status: "running", expanded: false });
    setRecruitCtx(undefined);
    try {
      const res = await testPipelineStep1b(searchPlan.keyword, searchPlan.companyTypes, searchPlan.jobTypes);
      setRecruitCtx(res.recruitCtx);
      const summary = [
        `채용 공고 ${res.jobs.length}개 수집`,
        ...res.logs,
        res.jobs.length > 0 ? "\n" + res.jobs.map((j: JobItem) => `• ${j.title} — ${j.company}`).join("\n") : "",
      ].filter(Boolean).join("\n");
      setStep1b({ status: "ok", result: summary, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setStep1b({ status: "error", error: e instanceof Error ? e.message : "채용 검색 실패", ms: Date.now() - t0, expanded: false });
    }
  }

  async function runStep2() {
    if (!searchPlan || !cloudModel) return;
    const t0 = Date.now();
    setStep2({ status: "running", expanded: false });
    try {
      const res = await testPipelineStep2(topic.trim(), cloudModel, searchPlan, webContext, recruitCtx);
      const summary = [
        `태스크 ${res.tasks.length}개 생성`,
        ...res.logs,
        "",
        ...res.tasks.map((t: any) => `${t.icon ?? "•"} ${t.title}\n  ${t.webSearchPrompt ?? t.prompt ?? ""}`),
      ].filter(Boolean).join("\n");
      setStep2({ status: "ok", result: summary, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setStep2({ status: "error", error: e instanceof Error ? e.message : "AI 태스크 생성 실패", ms: Date.now() - t0, expanded: false });
    }
  }

  async function runAll() {
    if (!topic.trim()) return;
    setRunningAll(true);
    try {
      // Step 0
      const t0 = Date.now();
      setStep0({ status: "running", expanded: false });
      setStep1a(initNode()); setStep1b(initNode()); setStep2(initNode());
      let plan: SearchPlan;
      try {
        const res = await testPipelineStep0(topic.trim(), localModel);
        plan = res.searchPlan;
        setSearchPlan(plan);
        setStep0({ status: "ok", result: planSummary(plan, res.logs), ms: Date.now() - t0, expanded: true });
      } catch (e: unknown) {
        setStep0({ status: "error", error: e instanceof Error ? e.message : "플랜 실패", ms: Date.now() - t0, expanded: false });
        return;
      }

      // Step 1a / 1b 병렬
      let wCtx: string | undefined;
      let rCtx: string | undefined;
      const parallel: Promise<void>[] = [];

      if (plan.searchMode === "web" || plan.searchMode === "both") {
        parallel.push((async () => {
          const t = Date.now();
          setStep1a({ status: "running", expanded: false });
          try {
            const res = await testPipelineStep1a(plan.keyword);
            wCtx = res.webContext;
            setWebContext(wCtx);
            setStep1a({ status: "ok", result: res.webContext ? `[${res.webContext.length.toLocaleString()}자]\n\n${logsToResult(res.logs)}` : logsToResult(res.logs), ms: Date.now() - t, expanded: true });
          } catch (e: unknown) {
            setStep1a({ status: "error", error: e instanceof Error ? e.message : "웹 검색 실패", ms: Date.now() - t, expanded: false });
          }
        })());
      }

      if (plan.searchMode === "recruit" || plan.searchMode === "both") {
        parallel.push((async () => {
          const t = Date.now();
          setStep1b({ status: "running", expanded: false });
          try {
            const res = await testPipelineStep1b(plan.keyword, plan.companyTypes, plan.jobTypes);
            rCtx = res.recruitCtx;
            setRecruitCtx(rCtx);
            const summary = [`채용 공고 ${res.jobs.length}개`, ...res.logs, res.jobs.length > 0 ? "\n" + res.jobs.map((j: JobItem) => `• ${j.title} — ${j.company}`).join("\n") : ""].filter(Boolean).join("\n");
            setStep1b({ status: "ok", result: summary, ms: Date.now() - t, expanded: true });
          } catch (e: unknown) {
            setStep1b({ status: "error", error: e instanceof Error ? e.message : "채용 검색 실패", ms: Date.now() - t, expanded: false });
          }
        })());
      }

      await Promise.allSettled(parallel);

      // Step 2
      const t2 = Date.now();
      setStep2({ status: "running", expanded: false });
      try {
        const res = await testPipelineStep2(topic.trim(), cloudModel, plan, wCtx, rCtx);
        const summary = [`태스크 ${res.tasks.length}개 생성`, ...res.logs, "", ...res.tasks.map((t: any) => `${t.icon ?? "•"} ${t.title}\n  ${t.webSearchPrompt ?? t.prompt ?? ""}`)].filter(Boolean).join("\n");
        setStep2({ status: "ok", result: summary, ms: Date.now() - t2, expanded: true });
      } catch (e: unknown) {
        setStep2({ status: "error", error: e instanceof Error ? e.message : "AI 태스크 생성 실패", ms: Date.now() - t2, expanded: false });
      }
    } finally {
      setRunningAll(false);
    }
  }

  function toggleExpand(setter: React.Dispatch<React.SetStateAction<NodeState>>) {
    setter((prev) => ({ ...prev, expanded: !prev.expanded }));
  }

  return (
    <div className="space-y-0">
      {/* 입력 */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3">입력</span>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runAll(); }}
          placeholder="테스트할 주제 또는 쿼리를 입력하세요..."
          className="w-full text-sm text-slate-800 placeholder:text-slate-300 bg-slate-50 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 mb-3"
        />
        <div className="flex gap-3 flex-wrap items-center">
          {localModels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 shrink-0">로컬 모델</span>
              <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                {localModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {apiModels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 shrink-0">API 모델</span>
              <select value={cloudModel} onChange={(e) => setCloudModel(e.target.value)} className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                {apiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <button
            onClick={runAll}
            disabled={!topic.trim() || runningAll}
            className="ml-auto px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {runningAll ? <span className="animate-spin">◌</span> : <span>▶</span>}
            전체 실행
          </button>
        </div>
      </div>

      <VConnector />

      {/* Step 0 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Step 0 — 검색 소스 결정</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="max-w-sm mx-auto">
          <NodeCard icon="🧭" label="Search Planner" desc="Ollama로 검색 소스·키워드 결정" state={step0} onRun={runStep0} disabled={!topic.trim()} />
          {step0.result && (
            <button onClick={() => toggleExpand(setStep0)} className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1">
              {step0.expanded ? "▲ 접기" : "▼ 결과 보기"}
            </button>
          )}
        </div>
      </div>

      {showBothRow ? <FanOut count={2} /> : <VConnector />}

      {/* Step 1 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Step 1 — 데이터 수집</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {!searchPlan && (
          <div className="max-w-sm mx-auto">
            <NodeCard icon="🔍" label="데이터 수집 (Step 1a / 1b)" desc="Step 0 실행 후 활성화됩니다" state={{ status: "disabled", expanded: false }} onRun={() => {}} disabled />
          </div>
        )}

        {searchPlan && !showOnlyRecruit && (
          <div className={showBothRow ? "grid grid-cols-2 gap-3" : "max-w-sm mx-auto"}>
            <div>
              <NodeCard icon="🌐" label="Web Search (Step 1a)" desc="웹 검색 엔진으로 컨텍스트 수집" state={canRun1a ? step1a : { ...step1a, status: "disabled", expanded: false }} onRun={runStep1a} disabled={!canRun1a} />
              {step1a.result && (
                <button onClick={() => toggleExpand(setStep1a)} className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1">
                  {step1a.expanded ? "▲ 접기" : "▼ 결과 보기"}
                </button>
              )}
            </div>
            {showBothRow && (
              <div>
                <NodeCard icon="💼" label="Recruit Search (Step 1b)" desc="채용 공고 크롤링" state={canRun1b ? step1b : { ...step1b, status: "disabled", expanded: false }} onRun={runStep1b} disabled={!canRun1b} />
                {step1b.result && (
                  <button onClick={() => toggleExpand(setStep1b)} className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1">
                    {step1b.expanded ? "▲ 접기" : "▼ 결과 보기"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {showOnlyRecruit && (
          <div className="max-w-sm mx-auto">
            <NodeCard icon="💼" label="Recruit Search (Step 1b)" desc="채용 공고 크롤링" state={canRun1b ? step1b : { ...step1b, status: "disabled", expanded: false }} onRun={runStep1b} disabled={!canRun1b} />
            {step1b.result && (
              <button onClick={() => toggleExpand(setStep1b)} className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1">
                {step1b.expanded ? "▲ 접기" : "▼ 결과 보기"}
              </button>
            )}
          </div>
        )}
      </div>

      {showBothRow ? <FanIn count={2} /> : <VConnector />}

      {/* Step 2 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Step 2 — AI 태스크 생성</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="max-w-sm mx-auto">
          <NodeCard
            icon="🤖"
            label={apiModels.find((m) => m.id === cloudModel)?.name ?? "AI 모델"}
            desc="수집된 컨텍스트 기반 태스크 생성"
            state={canRun2 ? step2 : { ...step2, status: "disabled", expanded: false }}
            onRun={runStep2}
            disabled={!canRun2 || !cloudModel}
          />
          {step2.result && (
            <button onClick={() => toggleExpand(setStep2)} className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1">
              {step2.expanded ? "▲ 접기" : "▼ 결과 보기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
