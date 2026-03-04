"use client";

import { useState, useEffect } from "react";
import {
  getPipelineStatus,
  getPromptTemplates,
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

const ENGINE_META: Record<SearchEngine, { label: string; icon: string; desc: string }> = {
  tavily: { label: "Tavily", icon: "⚡", desc: "AI 최적화 검색" },
  serper: { label: "Serper", icon: "🔍", desc: "Google 검색 API" },
  naver: { label: "Naver", icon: "🟢", desc: "한국어 뉴스 검색" },
  brave: { label: "Brave", icon: "🦁", desc: "독립 웹 검색" },
};

const STATUS_CONFIG: Record<
  NodeStatus,
  { dot: string; badge: string; label: string; border: string }
> = {
  idle: { dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500", label: "대기", border: "border-slate-200" },
  running: { dot: "bg-blue-400 animate-pulse", badge: "bg-blue-50 text-blue-600", label: "실행 중", border: "border-blue-300" },
  ok: { dot: "bg-green-400", badge: "bg-green-50 text-green-700", label: "완료", border: "border-green-300" },
  error: { dot: "bg-red-400", badge: "bg-red-50 text-red-600", label: "오류", border: "border-red-300" },
  disabled: { dot: "bg-slate-200", badge: "bg-slate-50 text-slate-300", label: "미설정", border: "border-slate-100" },
};

// ─── 모달 컴포넌트 ────────────────────────────────────────────────────────────

interface PromptField {
  label: string;
  hint?: string;
  rows?: number;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}

function PromptEditorModal({
  title,
  fields,
  onClose,
}: {
  title: string;
  fields: PromptField[];
  onClose: () => void;
}) {
  const isModified = fields.some((f) => f.value !== f.defaultValue);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-16">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800">{title}</span>
            {isModified && (
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                수정됨 — 테스트에 반영
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isModified && (
              <button
                onClick={() => fields.forEach((f) => f.onChange(f.defaultValue))}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                전체 초기화
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {fields.map((field) => (
            <div key={field.label}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {field.label}
                </label>
                {field.value !== field.defaultValue && (
                  <button
                    onClick={() => field.onChange(field.defaultValue)}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    초기화
                  </button>
                )}
              </div>
              {field.hint && (
                <p className="text-xs text-slate-400 mb-1.5">{field.hint}</p>
              )}
              <textarea
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                rows={field.rows ?? 8}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-y"
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 노드 카드 ────────────────────────────────────────────────────────────────

function NodeCard({
  icon,
  label,
  desc,
  state,
  onRun,
  disabled,
  extraActions,
}: {
  icon: string;
  label: string;
  desc: string;
  state: NodeState;
  onRun: () => void;
  disabled?: boolean;
  extraActions?: React.ReactNode;
}) {
  const cfg = STATUS_CONFIG[state.status];

  return (
    <div className={`bg-white rounded-2xl border-2 ${cfg.border} transition-all shadow-sm`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-base">{icon}</span>
              <span className="font-bold text-sm text-slate-800">{label}</span>
            </div>
            <span className="text-xs text-slate-400">{desc}</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${cfg.badge} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        </div>

        {state.ms !== undefined && state.status === "ok" && (
          <div className="text-xs text-slate-400 mb-2">⏱ {(state.ms / 1000).toFixed(1)}s</div>
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
          {extraActions}
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

// ─── 커넥터 ───────────────────────────────────────────────────────────────────

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
      <div className="absolute top-5 h-px bg-slate-200" style={{ left: `${positions[0]}%`, right: `${100 - positions[positions.length - 1]}%` }} />
      {positions.map((pct) => (
        <div key={pct} className="absolute top-5 bottom-0 w-px bg-slate-200" style={{ left: `${pct}%`, transform: "translateX(-50%)" }} />
      ))}
    </div>
  );
}

function FanIn({ count = 4 }: { count?: number }) {
  const positions = [12.5, 37.5, 62.5, 87.5].slice(0, count);
  return (
    <div className="relative h-10">
      {positions.map((pct) => (
        <div key={pct} className="absolute top-0 h-5 w-px bg-slate-200" style={{ left: `${pct}%`, transform: "translateX(-50%)" }} />
      ))}
      <div className="absolute top-5 h-px bg-slate-200" style={{ left: `${positions[0]}%`, right: `${100 - positions[positions.length - 1]}%` }} />
      <div className="absolute left-1/2 -translate-x-1/2 top-5 bottom-0 w-px bg-slate-200" />
    </div>
  );
}

// ─── 프롬프트 편집 버튼 ───────────────────────────────────────────────────────

function PromptEditButton({
  modified,
  active,
  onClick,
}: {
  modified: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
        active ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
      } ${modified ? "ring-1 ring-orange-300" : ""}`}
    >
      ✏️ 프롬프트
    </button>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

const SEARCH_ENGINES: SearchEngine[] = ["tavily", "serper", "naver", "brave"];

function initNode(status: NodeStatus = "idle"): NodeState {
  return { status, expanded: false };
}

export function PipelineDiagram({ apiModels }: { apiModels: ModelDefinition[] }) {
  const [query, setQuery] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [runningAll, setRunningAll] = useState(false);

  // 프롬프트 기본값 (BE에서 로딩)
  const [defaults, setDefaults] = useState({ generateTasks: "", system: "", ollamaFilter: "" });

  // AI 노드 프롬프트 편집
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");
  const [aiCustomSystem, setAiCustomSystem] = useState("");

  // Ollama 노드 프롬프트 편집
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

        {/* Fan-out */}
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

        {/* Fan-in */}
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

      {/* Ollama 프롬프트 편집 모달 */}
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

      {/* AI 프롬프트 편집 모달 */}
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
