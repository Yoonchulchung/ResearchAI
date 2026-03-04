"use client";

import { useState, useEffect } from "react";
import {
  getPipelineStatus,
  getPromptTemplates,
  testSearchEngine,
  testOllamaFilter,
  testGenerateTasks,
} from "@/lib/api";
import { ModelDefinition } from "@/types";
import { NodeState } from "../components/types";
import { NodeCard } from "../components/NodeCard";
import { PromptEditorModal } from "../components/PromptEditorModal";
import { VConnector, FanOut, FanIn } from "../components/Connectors";
import { PromptEditButton } from "../components/PromptEditButton";

type SearchEngine = "tavily" | "serper" | "naver" | "brave";

interface PipelineStatus {
  tavily: boolean;
  serper: boolean;
  naver: boolean;
  brave: boolean;
  ollama: boolean;
}

const ENGINE_META: Record<SearchEngine, { label: string; icon: string; desc: string }> = {
  tavily: { label: "Tavily", icon: "⚡", desc: "AI 최적화 검색" },
  serper: { label: "Serper", icon: "🔍", desc: "Google 검색 API" },
  naver: { label: "Naver", icon: "🟢", desc: "한국어 뉴스 검색" },
  brave: { label: "Brave", icon: "🦁", desc: "독립 웹 검색" },
};

const SEARCH_ENGINES: SearchEngine[] = ["tavily", "serper", "naver", "brave"];

function initNode(status: NodeState["status"] = "idle"): NodeState {
  return { status, expanded: false };
}

export function PipelineDiagram({ apiModels }: { apiModels: ModelDefinition[] }) {
  const [query, setQuery] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [runningAll, setRunningAll] = useState(false);

  const [defaults, setDefaults] = useState({ generateTasks: "", system: "", ollamaFilter: "" });

  const [showAiModal, setShowAiModal] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");
  const [aiCustomSystem, setAiCustomSystem] = useState("");

  const [showOllamaModal, setShowOllamaModal] = useState(false);
  const [ollamaCustomFilter, setOllamaCustomFilter] = useState("");

  const [nodes, setNodes] = useState<Record<SearchEngine | "ollama" | "ai", NodeState>>({
    tavily: initNode(),
    serper: initNode(),
    naver: initNode(),
    brave: initNode(),
    ollama: initNode(),
    ai: initNode(),
  });

  useEffect(() => {
    getPipelineStatus().then(setPipelineStatus).catch(() => {});
    getPromptTemplates()
      .then((t) => {
        setDefaults({ generateTasks: t.generateTasks, system: t.system, ollamaFilter: t.ollamaFilter });
        setAiCustomPrompt(t.generateTasks);
        setAiCustomSystem(t.system);
        setOllamaCustomFilter(t.ollamaFilter);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (apiModels.length > 0 && !selectedModel) setSelectedModel(apiModels[0].id);
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
      setNode(engine, { status: "error", error: e instanceof Error ? e.message : "검색 실패", ms: Date.now() - t0 });
    }
  }

  async function runOllama() {
    if (!query.trim()) return;
    const combined = SEARCH_ENGINES.map((e) => nodes[e].result).filter(Boolean).join("\n\n---\n\n");
    if (!combined) return;
    const t0 = Date.now();
    setNode("ollama", { status: "running", result: undefined, error: undefined });
    const isModified = ollamaCustomFilter !== defaults.ollamaFilter;
    try {
      const { result } = await testOllamaFilter(
        query.trim(),
        combined,
        isModified ? ollamaCustomFilter : undefined,
      );
      setNode("ollama", { status: "ok", result, ms: Date.now() - t0, expanded: true });
    } catch (e: unknown) {
      setNode("ollama", { status: "error", error: e instanceof Error ? e.message : "필터 실패", ms: Date.now() - t0 });
    }
  }

  async function runAI() {
    if (!query.trim() || !selectedModel) return;
    const t0 = Date.now();
    setNode("ai", { status: "running", result: undefined, error: undefined });
    const isModified = aiCustomPrompt !== defaults.generateTasks || aiCustomSystem !== defaults.system;
    try {
      const { tasks } = await testGenerateTasks(
        query.trim(),
        selectedModel,
        isModified ? { customPrompt: aiCustomPrompt, customSystem: aiCustomSystem } : undefined,
      );
      setNode("ai", {
        status: "ok",
        result: `[생성된 태스크 ${tasks.length}개]\n\n${tasks.map((t: { icon: string; title: string; prompt: string }) => `${t.icon} ${t.title}\n  ${t.prompt}`).join("\n\n")}`,
        ms: Date.now() - t0,
        expanded: true,
      });
    } catch (e: unknown) {
      setNode("ai", { status: "error", error: e instanceof Error ? e.message : "AI 실패", ms: Date.now() - t0 });
    }
  }

  async function runAll() {
    if (!query.trim()) return;
    setRunningAll(true);
    const enabledEngines = SEARCH_ENGINES.filter((e) => pipelineStatus?.[e] !== false);
    await Promise.allSettled(enabledEngines.map(runSearch));
    await runOllama();
    await runAI();
    setRunningAll(false);
  }

  const enabledEngines = SEARCH_ENGINES.filter((e) => pipelineStatus?.[e] !== false);
  const hasSearchResults = SEARCH_ENGINES.some((e) => nodes[e].result);

  return (
    <>
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
              {runningAll ? <span className="animate-spin text-sm">◌</span> : <span>▶</span>}
              전체 실행
            </button>
          </div>
        </div>

        <FanOut count={enabledEngines.length || 4} />

        {/* Search engines */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">검색 파이프라인 (병렬)</span>
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

        <FanIn count={enabledEngines.length || 4} />

        {/* Ollama filter */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">로컬 필터 (Ollama)</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <div className="max-w-sm mx-auto">
            <NodeCard
              icon="🦙"
              label="Ollama Filter"
              desc="검색 결과 압축 필터"
              state={nodes.ollama}
              onRun={runOllama}
              disabled={!hasSearchResults || !query.trim()}
              extraActions={
                <PromptEditButton
                  modified={ollamaCustomFilter !== defaults.ollamaFilter}
                  active={showOllamaModal}
                  onClick={() => setShowOllamaModal(true)}
                />
              }
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
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI 태스크 생성</span>
            <div className="flex-1 h-px bg-slate-100" />
            {apiModels.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
              >
                {apiModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
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
              extraActions={
                <PromptEditButton
                  modified={aiCustomPrompt !== defaults.generateTasks || aiCustomSystem !== defaults.system}
                  active={showAiModal}
                  onClick={() => setShowAiModal(true)}
                />
              }
            />
            {nodes.ai.result && (
              <button
                onClick={() => toggleExpand("ai")}
                className="w-full mt-1 text-xs text-slate-400 hover:text-slate-600 text-center py-1"
              >
                {nodes.ai.expanded ? "▲ 접기" : "▼ 결과 보기"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showOllamaModal && (
        <PromptEditorModal
          title="Ollama 필터 프롬프트"
          onClose={() => setShowOllamaModal(false)}
          fields={[
            {
              label: "필터 프롬프트",
              hint: "변수: {{query}} (검색 쿼리), {{context}} (원본 검색 결과)",
              rows: 16,
              value: ollamaCustomFilter,
              defaultValue: defaults.ollamaFilter,
              onChange: setOllamaCustomFilter,
            },
          ]}
        />
      )}

      {showAiModal && (
        <PromptEditorModal
          title="AI 태스크 생성 프롬프트"
          onClose={() => setShowAiModal(false)}
          fields={[
            {
              label: "시스템 프롬프트",
              rows: 7,
              value: aiCustomSystem,
              defaultValue: defaults.system,
              onChange: setAiCustomSystem,
            },
            {
              label: "태스크 생성 프롬프트",
              hint: "변수: {{topic}} (주제), {{searchContext}} (검색 결과 삽입 위치)",
              rows: 14,
              value: aiCustomPrompt,
              defaultValue: defaults.generateTasks,
              onChange: setAiCustomPrompt,
            },
          ]}
        />
      )}
    </>
  );
}
