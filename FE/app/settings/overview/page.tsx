"use client";

import { useEffect, useState, useCallback } from "react";
import { getTavilyOverview, type ApiKeyEntry } from "@/lib/api";
import { getModels } from "@/lib/api/research";
import { useAuth } from "@/contexts/AuthContext";
import { updateApiKeyApi } from "@/lib/api/auth";
import { ModelDefinition } from "@/types";
import { useTheme } from "@/contexts/ThemeContext";
import {
  type TavilyOverview,
  PageHeader,
  TavilyCard,
  TokenUsageCard,
  ApiKeysTable,
} from "./components";

interface AnalyticsSummary {
  totalCost: number;
  totalCalls: number;
  models: string[];
}

function CloudModelConfigCard({
  cloudModels,
  currentModel,
  onSave,
}: {
  cloudModels: ModelDefinition[];
  currentModel: string;
  onSave: (model: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState(currentModel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setSelected(currentModel); }, [currentModel]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
        클라우드 AI 모델 기본값
      </p>
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {cloudModels.length === 0 ? (
            <option value="">클라우드 모델 없음</option>
          ) : (
            cloudModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))
          )}
        </select>
        <button
          onClick={handleSave}
          disabled={saving || cloudModels.length === 0}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        딥리서치 등 클라우드 AI를 사용하는 기능의 기본 모델입니다.
      </p>
    </div>
  );
}

function LocalModelConfigCard({
  ollamaModels,
  currentModel,
  onSave,
}: {
  ollamaModels: ModelDefinition[];
  currentModel: string;
  onSave: (model: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState(currentModel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setSelected(currentModel); }, [currentModel]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
        로컬 모델 기본값
      </p>
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {ollamaModels.length === 0 ? (
            <option value="">Ollama 모델 없음</option>
          ) : (
            ollamaModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))
          )}
        </select>
        <button
          onClick={handleSave}
          disabled={saving || ollamaModels.length === 0}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        AI 서머리 등 로컬 LLM을 사용하는 기능의 기본 모델입니다.
      </p>
    </div>
  );
}

export default function OverviewPage() {
  const { uiStyle } = useTheme();
  const isGlass = uiStyle === "glass";
  const { user, refreshUser } = useAuth();

  const [tavily, setTavily] = useState<TavilyOverview | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [ollamaModels, setOllamaModels] = useState<ModelDefinition[]>([]);
  const [cloudModels, setCloudModels] = useState<ModelDefinition[]>([]);
  const [defaultLocalModel, setDefaultLocalModel] = useState("");
  const [defaultCloudModel, setDefaultCloudModel] = useState("");

  const buildApiKeys = useCallback((u: typeof user): ApiKeyEntry[] => {
    if (!u) return [];
    return [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic", masked: u.anthropicApiKey ? `sk-ant-...${u.anthropicApiKey.slice(-4)}` : null, configured: !!u.anthropicApiKey },
      { key: "OPENAI_API_KEY", label: "OpenAI", masked: u.openaiApiKey ? `sk-...${u.openaiApiKey.slice(-4)}` : null, configured: !!u.openaiApiKey },
      { key: "GOOGLE_API_KEY", label: "Google", masked: u.googleApiKey ? `AIza...${u.googleApiKey.slice(-4)}` : null, configured: !!u.googleApiKey },
      { key: "TAVILY_API_KEY", label: "Tavily", masked: u.tavilyApiKey ? `tvly-...${u.tavilyApiKey.slice(-4)}` : null, configured: !!u.tavilyApiKey },
      { key: "SERPER_API_KEY", label: "Serper", masked: u.serperApiKey ? `...${u.serperApiKey.slice(-4)}` : null, configured: !!u.serperApiKey },
      { key: "NAVER_CLIENT_ID", label: "Naver Client ID", masked: u.naverClientId ? `...${u.naverClientId.slice(-4)}` : null, configured: !!u.naverClientId },
      { key: "NAVER_CLIENT_SECRET", label: "Naver Client Secret", masked: u.naverClientSecret ? `...${u.naverClientSecret.slice(-4)}` : null, configured: !!u.naverClientSecret },
      { key: "BRAVE_API_KEY", label: "Brave", masked: u.braveApiKey ? `...${u.braveApiKey.slice(-4)}` : null, configured: !!u.braveApiKey },
    ];
  }, []);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      getTavilyOverview(),
      fetch("http://localhost:3001/api/overview/analytics?range=30d").then((r) => r.json()),
      getModels(),
      fetch("http://localhost:3001/api/config").then((r) => r.json()),
    ]).then(([tavilyRes, analyticsRes, modelsRes, configRes]) => {
      if (tavilyRes.status === "fulfilled") setTavily(tavilyRes.value);
      if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value);
      if (modelsRes.status === "fulfilled") {
        const all = modelsRes.value as ModelDefinition[];
        setOllamaModels(all.filter((m) => m.provider === "ollama"));
        setCloudModels(all.filter((m) => m.provider !== "ollama"));
      }
      if (configRes.status === "fulfilled") {
        const cfg = configRes.value as Record<string, string>;
        setDefaultLocalModel(cfg.default_local_model ?? "");
        setDefaultCloudModel(cfg.default_cloud_model ?? "");
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setApiKeys(buildApiKeys(user)); }, [user, buildApiKeys]);

  const handleSaveLocalModel = async (model: string) => {
    await fetch("http://localhost:3001/api/config/default_local_model", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: model }),
    });
    setDefaultLocalModel(model);
  };

  const handleSaveCloudModel = async (model: string) => {
    await fetch("http://localhost:3001/api/config/default_cloud_model", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: model }),
    });
    setDefaultCloudModel(model);
  };

  return (
    <div className={`min-h-full flex flex-col transition-all ${isGlass ? "p-3 pr-4 pb-4 bg-transparent" : "bg-slate-50"}`}>
      <div className={`flex-1 flex flex-col transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl overflow-hidden" : ""}`}>
        <PageHeader loading={loading} isGlass={isGlass} />

        <div className="px-8 py-8 space-y-6 max-w-4xl mx-auto w-full">
          <TavilyCard loading={loading} tavily={tavily} />
          <TokenUsageCard loading={loading} analytics={analytics} />
          <CloudModelConfigCard
            cloudModels={cloudModels}
            currentModel={defaultCloudModel}
            onSave={handleSaveCloudModel}
          />
          <LocalModelConfigCard
            ollamaModels={ollamaModels}
            currentModel={defaultLocalModel}
            onSave={handleSaveLocalModel}
          />
          <ApiKeysTable loading={loading} apiKeys={apiKeys} onRefresh={refreshUser} />

          <div className={`rounded-2xl border px-6 py-5 flex items-center justify-between ${isGlass ? "border-white/20 bg-white/5" : "bg-white border-slate-200 shadow-sm"}`}>
            <p className={`text-sm ${isGlass ? "text-white/60" : "text-slate-500"}`}>
              Have any questions, feedback or need support? We&apos;d love to hear from you!
            </p>
            <button className={`px-5 py-2 border rounded-xl text-sm font-medium transition-colors ${isGlass ? "border-white/20 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              Contact us
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
