"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api/base";
import { getTavilyOverview, type ApiKeyEntry } from "@/lib/api";
import { getModels } from "@/lib/api/research";
import { useAuth } from "@/contexts/AuthContext";
import { LoginRequired } from "@/components/LoginRequired";
import { updateDefaultModelsApi, getLoginHistoryApi, type LoginHistory } from "@/lib/api/auth";
import { ModelDefinition } from "@/types";
import { useTheme } from "@/contexts/ThemeContext";
import {
  type TavilyOverview,
  PageHeader,
  TavilyCard,
  TokenUsageCard,
  ApiKeysTable,
  ServiceCredentialsCard,
} from "./components";

interface AnalyticsSummary {
  totalCost: number;
  totalCalls: number;
  models: string[];
  chartData: Record<string, string | number>[];
  byModel: Record<string, { cost: number; calls: number }>;
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

function parseUA(ua: string | null): string {
  if (!ua) return "알 수 없는 기기";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "기타";
}

function formatLoginDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function LoginHistoryCard() {
  const [history, setHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLoginHistoryApi()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
        로그인 기록
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
          <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
          불러오는 중...
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">로그인 기록이 없습니다.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between py-2.5 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                  h.action === "register"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-indigo-50 text-indigo-600"
                }`}>
                  {h.action === "register" ? "가입" : "로그인"}
                </span>
                <span className="text-sm font-medium text-slate-700 shrink-0">{parseUA(h.userAgent)}</span>
                {h.ipAddress && (
                  <span className="text-xs text-slate-400 truncate font-mono">{h.ipAddress}</span>
                )}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatLoginDate(h.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
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
      fetch(`${API_BASE}/overview/analytics?range=30d`).then((r) => r.json()).then((d) => d.result),
      getModels(),
    ]).then(([tavilyRes, analyticsRes, modelsRes]) => {
      if (tavilyRes.status === "fulfilled") setTavily(tavilyRes.value);
      if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value);
      if (modelsRes.status === "fulfilled") {
        const all = modelsRes.value as ModelDefinition[];
        setOllamaModels(all.filter((m) => m.provider === "ollama"));
        setCloudModels(all.filter((m) => m.provider !== "ollama"));
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    setApiKeys(buildApiKeys(user));
    if (user?.defaultCloudModel) setDefaultCloudModel(user.defaultCloudModel);
    if (user?.defaultLocalModel) setDefaultLocalModel(user.defaultLocalModel);
  }, [user, buildApiKeys]);

  const handleSaveLocalModel = async (model: string) => {
    await updateDefaultModelsApi(undefined, model);
    setDefaultLocalModel(model);
    refreshUser();
  };

  const handleSaveCloudModel = async (model: string) => {
    await updateDefaultModelsApi(model, undefined);
    setDefaultCloudModel(model);
    refreshUser();
  };

  if (!user) return <LoginRequired />;

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
          <ServiceCredentialsCard
            loading={loading}
            dartApiKey={user?.dartApiKey ?? null}
            jobplanetId={user?.jobplanetId ?? null}
            jobplanetPassword={user?.jobplanetPassword ?? null}
            jobkoreaId={user?.jobkoreaId ?? null}
            jobkoreaPassword={user?.jobkoreaPassword ?? null}
            onRefresh={refreshUser}
          />
          <LoginHistoryCard />

          <div className={`rounded-2xl border px-6 py-5 flex items-center justify-between ${isGlass ? "border-white/20 bg-white/5" : "bg-white border-slate-200 shadow-sm"}`}>
            <p className={`text-sm ${isGlass ? "text-white/60" : "text-slate-500"}`}>
              Have any questions, feedback or need support? We&apos;d love to hear from you!
            </p>
            <a
              href="mailto:yoonchul005@gmail.com"
              className={`inline-block px-5 py-2 border rounded-xl text-sm font-medium transition-colors ${isGlass ? "border-white/20 text-white/70 hover:bg-white/10" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              Contact us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
