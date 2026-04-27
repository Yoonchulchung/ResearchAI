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
  cloudAiModels,
  localAiModels,
}: {
  cloudAiModels: ModelDefinition[];
  localAiModels: ModelDefinition[];
}) {
  const [topic, setTopic] = useState("");
  const [localModel, setLocalModel] = useState(localAiModels[0]?.id ?? "");
  const [cloudModel, setCloudModel] = useState(cloudAiModels[0]?.id ?? "");

  useEffect(() => {
    if (cloudAiModels.length > 0 && !cloudModel) setCloudModel(cloudAiModels[0].id);
  }, [cloudAiModels]);

  useEffect(() => {
    if (localAiModels.length > 0 && !localModel) setLocalModel(localAiModels[0].id);
  }, [localAiModels]);
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
      plan.companyTypes?.length ? `기업 유형: ${plan.companyTypes.join(", ")}` : "",
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
      setStep0({ status: "error", error: e instanceof Error ? e.message : "플래너 실행 실패", ms: Date.now() - t0, expanded: false });
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
          ? `[${res.webContext.length.toLocaleString()}자 수집됨]\n\n${logsToResult(res.logs)}`
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
        `채용 공고 ${res.jobs.length}건 수집됨`,
        ...res.logs,
        res.jobs.length > 0 ? "\n" + res.jobs.map((j: JobItem) => `• ${j.title} — ${j.company}`).join("\n") : "",
      ].filter(Boolean).join("\n");
      setStep1b({ status: "ok", result: summary, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setStep1b({ status: "error", error: e instanceof Error ? e.message : "채용 공고 검색 실패", ms: Date.now() - t0, expanded: false });
    }
  }

  async function runStep2() {
    if (!searchPlan || !cloudModel) return;
    const t0 = Date.now();
    setStep2({ status: "running", expanded: false });
    try {
      const res = await testPipelineStep2(topic.trim(), cloudModel, searchPlan, webContext, recruitCtx);
      const summary = [
        `태스크 ${res.tasks.length}개 생성됨`,
        ...res.logs,
        "",
        ...res.tasks.map((t: any) => `${t.title}\n  ${t.webSearchPrompt ?? t.prompt ?? ""}`),
      ].filter(Boolean).join("\n");
      setStep2({ status: "ok", result: summary, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setStep2({ status: "error", error: e instanceof Error ? e.message : "태스크 생성 실패", ms: Date.now() - t0, expanded: false });
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
        setStep0({ status: "error", error: e instanceof Error ? e.message : "플래너 실행 실패", ms: Date.now() - t0, expanded: false });
        return;
      }

      // Step 1a / 1b Parallel
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
            setStep1a({ status: "ok", result: res.webContext ? `[${res.webContext.length.toLocaleString()}자 수집됨]\n\n${logsToResult(res.logs)}` : logsToResult(res.logs), ms: Date.now() - t, expanded: true });
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
            const summary = [`채용 공고 ${res.jobs.length}건`, ...res.logs, res.jobs.length > 0 ? "\n" + res.jobs.map((j: JobItem) => `• ${j.title} — ${j.company}`).join("\n") : ""].filter(Boolean).join("\n");
            setStep1b({ status: "ok", result: summary, ms: Date.now() - t, expanded: true });
          } catch (e: unknown) {
            setStep1b({ status: "error", error: e instanceof Error ? e.message : "채용 공고 검색 실패", ms: Date.now() - t, expanded: false });
          }
        })());
      }

      await Promise.allSettled(parallel);

      // Step 2
      const t2 = Date.now();
      setStep2({ status: "running", expanded: false });
      try {
        const res = await testPipelineStep2(topic.trim(), cloudModel, plan, wCtx, rCtx);
        const summary = [`태스크 ${res.tasks.length}개 생성됨`, ...res.logs, "", ...res.tasks.map((t: any) => `${t.title}\n  ${t.webSearchPrompt ?? t.prompt ?? ""}`)].filter(Boolean).join("\n");
        setStep2({ status: "ok", result: summary, ms: Date.now() - t2, expanded: true });
      } catch (e: unknown) {
        setStep2({ status: "error", error: e instanceof Error ? e.message : "태스크 생성 실패", ms: Date.now() - t2, expanded: false });
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
      {/* Target Subject Input */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">테스트 입력</h3>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runAll(); }}
          placeholder="테스트할 주제 또는 키워드를 입력하세요..."
          className="w-full text-sm text-slate-900 border border-slate-300 rounded-md px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-5 shadow-sm"
        />
        <div className="border-t border-slate-100 pt-4 flex gap-4 flex-wrap items-center">
          {localAiModels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">로컬 모델</span>
              <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} className="text-sm text-slate-700 border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none bg-white">
                {localAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {cloudAiModels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">API 모델</span>
              <select value={cloudModel} onChange={(e) => setCloudModel(e.target.value)} className="text-sm text-slate-700 border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none bg-white">
                {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <button
            onClick={runAll}
            disabled={!topic.trim() || runningAll}
            className="ml-auto px-5 py-2 min-w-32 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {runningAll ? "실행 중..." : "전체 실행"}
          </button>
        </div>
      </div>

      <VConnector />

      {/* Step 0 */}
      <div>
        <div className="max-w-[400px] mx-auto">
          <NodeCard label="검색 플래너 (Step 0)" desc="로컬 모델을 통한 검색 소스 및 키워드 결정" state={step0} onRun={runStep0} disabled={!topic.trim()} />
          {step0.result && (
            <button onClick={() => toggleExpand(setStep0)} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-700 font-medium py-1 transition-colors">
              {step0.expanded ? "결과 숨기기" : "결과 보기"}
            </button>
          )}
        </div>
      </div>

      {showBothRow ? <FanOut count={2} /> : <VConnector />}

      {/* Step 1 */}
      <div>
        {!searchPlan && (
          <div className="max-w-[400px] mx-auto">
            <NodeCard label="데이터 수집 (Step 1)" desc="Step 0 실행 시 활성화됩니다" state={{ status: "disabled", expanded: false }} onRun={() => {}} disabled />
          </div>
        )}

        {searchPlan && !showOnlyRecruit && (
          <div className={showBothRow ? "grid grid-cols-2 gap-4" : "max-w-[400px] mx-auto"}>
            <div>
              <NodeCard label="웹 검색 (Step 1a)" desc="구글 검색 API 컨텍스트 수집" state={canRun1a ? step1a : { ...step1a, status: "disabled", expanded: false }} onRun={runStep1a} disabled={!canRun1a} />
              {step1a.result && (
                <button onClick={() => toggleExpand(setStep1a)} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-700 font-medium py-1 transition-colors">
                  {step1a.expanded ? "결과 숨기기" : "결과 보기"}
                </button>
              )}
            </div>
            {showBothRow && (
              <div>
                <NodeCard label="채용 공고 검색 (Step 1b)" desc="라이브 채용 플랫폼 데이터 수집" state={canRun1b ? step1b : { ...step1b, status: "disabled", expanded: false }} onRun={runStep1b} disabled={!canRun1b} />
                {step1b.result && (
                  <button onClick={() => toggleExpand(setStep1b)} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-700 font-medium py-1 transition-colors">
                    {step1b.expanded ? "결과 숨기기" : "결과 보기"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {showOnlyRecruit && (
          <div className="max-w-[400px] mx-auto">
            <NodeCard label="채용 공고 검색 (Step 1b)" desc="라이브 채용 플랫폼 데이터 수집" state={canRun1b ? step1b : { ...step1b, status: "disabled", expanded: false }} onRun={runStep1b} disabled={!canRun1b} />
            {step1b.result && (
              <button onClick={() => toggleExpand(setStep1b)} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-700 font-medium py-1 transition-colors">
                {step1b.expanded ? "결과 숨기기" : "결과 보기"}
              </button>
            )}
          </div>
        )}
      </div>

      {showBothRow ? <FanIn count={2} /> : <VConnector />}

      {/* Step 2 */}
      <div>
        <div className="max-w-[400px] mx-auto">
          <NodeCard
            label={cloudAiModels.find((m) => m.id === cloudModel)?.name ?? "클라우드 AI 모델"}
            desc="수집된 문맥을 바탕으로 최종 AI 태스크 도출"
            state={canRun2 ? step2 : { ...step2, status: "disabled", expanded: false }}
            onRun={runStep2}
            disabled={!canRun2 || !cloudModel}
          />
          {step2.result && (
            <button onClick={() => toggleExpand(setStep2)} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-700 font-medium py-1 transition-colors">
              {step2.expanded ? "결과 숨기기" : "결과 보기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
