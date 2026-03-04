"use client";

import { useState, useEffect } from "react";
import {
  getPipelineStatus,
  testSearchEngine,
  testOllamaFilter,
  testGenerateTasks,
} from "../lib/api";
import { ModelDefinition } from "../types";

type NodeStatus = "idle" | "running" | "ok" | "error" | "disabled";

interface NodeState {
  status: NodeStatus;
  result?: string;
  error?: string;
  ms?: number;
  expanded: boolean;
}

type SearchEngine = "tavily" | "serper" | "naver" | "brave";

interface PipelineStatus {
  tavily: boolean;
  serper: boolean;
  naver: boolean;
  brave: boolean;
  ollama: boolean;
}

const ENGINE_META: Record<
  SearchEngine,
  { label: string; icon: string; desc: string }
> = {
  tavily: { label: "Tavily", icon: "⚡", desc: "AI 최적화 검색" },
  serper: { label: "Serper", icon: "🔍", desc: "Google 검색 API" },
  naver: { label: "Naver", icon: "🟢", desc: "한국어 뉴스 검색" },
  brave: { label: "Brave", icon: "🦁", desc: "독립 웹 검색" },
};

const STATUS_CONFIG: Record<
  NodeStatus,
  { dot: string; badge: string; label: string; border: string }
> = {
  idle: {
    dot: "bg-slate-300",
    badge: "bg-slate-100 text-slate-500",
    label: "대기",
    border: "border-slate-200",
  },
  running: {
    dot: "bg-blue-400 animate-pulse",
    badge: "bg-blue-50 text-blue-600",
    label: "실행 중",
    border: "border-blue-300",
  },
  ok: {
    dot: "bg-green-400",
    badge: "bg-green-50 text-green-700",
    label: "완료",
    border: "border-green-300",
  },
  error: {
    dot: "bg-red-400",
    badge: "bg-red-50 text-red-600",
    label: "오류",
    border: "border-red-300",
  },
  disabled: {
    dot: "bg-slate-200",
    badge: "bg-slate-50 text-slate-300",
    label: "미설정",
    border: "border-slate-100",
  },
};

function NodeCard({
  icon,
  label,
  desc,
  state,
  onRun,
  disabled,
}: {
  icon: string;
  label: string;
  desc: string;
  state: NodeState;
  onRun: () => void;
  disabled?: boolean;
}) {
  const cfg = STATUS_CONFIG[state.status];

  return (
    <div
      className={`bg-white rounded-2xl border-2 ${cfg.border} transition-all shadow-sm`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-base">{icon}</span>
              <span className="font-bold text-sm text-slate-800">{label}</span>
            </div>
            <span className="text-xs text-slate-400">{desc}</span>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${cfg.badge} shrink-0`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        </div>

        {state.ms !== undefined && state.status === "ok" && (
          <div className="text-xs text-slate-400 mb-2">
            ⏱ {(state.ms / 1000).toFixed(1)}s
          </div>
        )}

        {state.error && (
          <div className="text-xs text-red-500 bg-red-50 rounded-lg px-2 py-1.5 mb-2">
            {state.error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={disabled || state.status === "running"}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {state.status === "running" ? (
              <span className="animate-spin text-xs">◌</span>
            ) : (
              <span>▶</span>
            )}
            테스트
          </button>
        </div>
      </div>

      {state.result && state.expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          <pre className="text-xs text-slate-600 whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto font-mono leading-relaxed">
            {state.result}
          </pre>
        </div>
      )}
    </div>
  );
}

function VConnector() {
  return (
    <div className="flex justify-center py-1">
      <div className="w-px h-8 bg-slate-200" />
    </div>
  );
}

function FanOut({ count = 4 }: { count?: number }) {
  const positions = [12.5, 37.5, 62.5, 87.5].slice(0, count);
  return (
    <div className="relative h-10">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 h-5 w-px bg-slate-200" />
      <div
        className="absolute top-5 h-px bg-slate-200"
        style={{ left: `${positions[0]}%`, right: `${100 - positions[positions.length - 1]}%` }}
      />
      {positions.map((pct) => (
        <div
          key={pct}
          className="absolute top-5 bottom-0 w-px bg-slate-200"
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        />
      ))}
    </div>
  );
}

function FanIn({ count = 4 }: { count?: number }) {
  const positions = [12.5, 37.5, 62.5, 87.5].slice(0, count);
  return (
    <div className="relative h-10">
      {positions.map((pct) => (
        <div
          key={pct}
          className="absolute top-0 h-5 w-px bg-slate-200"
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        />
      ))}
      <div
        className="absolute top-5 h-px bg-slate-200"
        style={{ left: `${positions[0]}%`, right: `${100 - positions[positions.length - 1]}%` }}
      />
      <div className="absolute left-1/2 -translate-x-1/2 top-5 bottom-0 w-px bg-slate-200" />
    </div>
  );
}

const SEARCH_ENGINES: SearchEngine[] = ["tavily", "serper", "naver", "brave"];

function initNode(status: NodeStatus = "idle"): NodeState {
  return { status, expanded: false };
}

export function PipelineDiagram({ apiModels }: { apiModels: ModelDefinition[] }) {
  const [query, setQuery] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [runningAll, setRunningAll] = useState(false);

  const [nodes, setNodes] = useState<
    Record<SearchEngine | "ollama" | "ai", NodeState>
  >({
    tavily: initNode(),
    serper: initNode(),
    naver: initNode(),
    brave: initNode(),
    ollama: initNode(),
    ai: initNode(),
  });

  useEffect(() => {
    getPipelineStatus()
      .then(setPipelineStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (apiModels.length > 0 && !selectedModel) {
      setSelectedModel(apiModels[0].id);
    }
  }, [apiModels]);

  function setNode(id: string, patch: Partial<NodeState>) {
    setNodes((prev) => ({ ...prev, [id]: { ...prev[id as keyof typeof prev], ...patch } }));
  }

  function toggleExpand(id: string) {
    setNodes((prev) => ({
      ...prev,
      [id]: { ...prev[id as keyof typeof prev], expanded: !prev[id as keyof typeof prev].expanded },
    }));
  }

  async function runSearch(engine: SearchEngine) {
    if (!query.trim()) return;
    const t0 = Date.now();
    setNode(engine, { status: "running", result: undefined, error: undefined });
    try {
      const { result } = await testSearchEngine(engine, query.trim());
      setNode(engine, { status: "ok", result, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setNode(engine, {
        status: "error",
        error: e instanceof Error ? e.message : "검색 실패",
        ms: Date.now() - t0,
      });
    }
  }

  async function runOllama() {
    if (!query.trim()) return;
    const combined = SEARCH_ENGINES.map((e) => nodes[e].result)
      .filter(Boolean)
      .join("\n\n---\n\n");
    if (!combined) return;
    const t0 = Date.now();
    setNode("ollama", { status: "running", result: undefined, error: undefined });
    try {
      const { result } = await testOllamaFilter(query.trim(), combined);
      setNode("ollama", { status: "ok", result, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setNode("ollama", {
        status: "error",
        error: e instanceof Error ? e.message : "필터 실패",
        ms: Date.now() - t0,
      });
    }
  }

  async function runAI() {
    if (!query.trim() || !selectedModel) return;
    const t0 = Date.now();
    setNode("ai", { status: "running", result: undefined, error: undefined });
    try {
      const { tasks } = await testGenerateTasks(query.trim(), selectedModel);
      setNode("ai", {
        status: "ok",
        result: `[생성된 태스크 ${tasks.length}개]\n\n${tasks.map((t: { icon: string; title: string; prompt: string }) => `${t.icon} ${t.title}\n  ${t.prompt}`).join("\n\n")}`,
        ms: Date.now() - t0,
        expanded: true,
      });
    } catch (e: unknown) {
      setNode("ai", {
        status: "error",
        error: e instanceof Error ? e.message : "AI 실패",
        ms: Date.now() - t0,
      });
    }
  }

  async function runAll() {
    if (!query.trim()) return;
    setRunningAll(true);
    // 1. 검색 병렬 실행
    const enabledEngines = SEARCH_ENGINES.filter(
      (e) => pipelineStatus?.[e] !== false
    );
    await Promise.allSettled(enabledEngines.map(runSearch));
    // 2. Ollama 필터
    await runOllama();
    // 3. AI 태스크 생성
    await runAI();
    setRunningAll(false);
  }

  const enabledEngines = SEARCH_ENGINES.filter((e) => pipelineStatus?.[e] !== false);
  const hasSearchResults = SEARCH_ENGINES.some((e) => nodes[e].result);

  return (
    <div className="space-y-0">
      {/* Query input */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">입력</span>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runAll(); }}
            placeholder="테스트할 검색 쿼리 또는 주제를 입력하세요..."
            className="flex-1 text-sm text-slate-800 placeholder:text-slate-300 bg-slate-50 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={runAll}
            disabled={!query.trim() || runningAll}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shrink-0"
          >
            {runningAll ? (
              <span className="animate-spin text-sm">◌</span>
            ) : (
              <span>▶</span>
            )}
            전체 실행
          </button>
        </div>
      </div>

      {/* Fan-out connector */}
      <FanOut count={enabledEngines.length || 4} />

      {/* Search engines */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            검색 파이프라인 (병렬)
          </span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SEARCH_ENGINES.map((engine) => {
            const meta = ENGINE_META[engine];
            const isEnabled = pipelineStatus?.[engine] !== false;
            const state = nodes[engine];
            return (
              <div key={engine}>
                <NodeCard
                  icon={meta.icon}
                  label={meta.label}
                  desc={meta.desc}
                  state={isEnabled ? state : { ...state, status: "disabled", expanded: false }}
                  onRun={() => runSearch(engine)}
                  disabled={!isEnabled || !query.trim()}
                />
                {state.result && (
                  <button
                    onClick={() => toggleExpand(engine)}
                    className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1"
                  >
                    {state.expanded ? "▲ 접기" : `▼ 결과 보기 (${state.result.length.toLocaleString()}자)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fan-in connector */}
      <FanIn count={enabledEngines.length || 4} />

      {/* Ollama filter */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            로컬 필터 (Ollama)
          </span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="max-w-sm mx-auto">
          <NodeCard
            icon="🦙"
            label="Ollama Filter"
            desc={`검색 결과 압축 · ${process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? "llama3.2:3b"}`}
            state={nodes.ollama}
            onRun={runOllama}
            disabled={!hasSearchResults || !query.trim()}
          />
          {nodes.ollama.result && (
            <button
              onClick={() => toggleExpand("ollama")}
              className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1"
            >
              {nodes.ollama.expanded ? "▲ 접기" : `▼ 결과 보기 (${nodes.ollama.result.length.toLocaleString()}자)`}
            </button>
          )}
        </div>
      </div>

      <VConnector />

      {/* AI model */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            AI 태스크 생성
          </span>
          <div className="flex-1 h-px bg-slate-100" />
          {apiModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
            >
              {apiModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="max-w-sm mx-auto">
          <NodeCard
            icon="🤖"
            label={apiModels.find((m) => m.id === selectedModel)?.name ?? "AI 모델"}
            desc="검색 컨텍스트 기반 태스크 생성"
            state={nodes.ai}
            onRun={runAI}
            disabled={!query.trim() || !selectedModel}
          />
          {nodes.ai.result && (
            <button
              onClick={() => toggleExpand("ai")}
              className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1"
            >
              {nodes.ai.expanded ? "▲ 접기" : `▼ 결과 보기`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
