"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api/base";

type Tab = "news" | "github" | "hf";

const TABS: { value: Tab; label: string }[] = [
  { value: "news", label: "뉴스" },
  { value: "github", label: "GitHub" },
  { value: "hf", label: "HuggingFace" },
];

const GITHUB_SINCE = [
  { label: "오늘", value: "daily" },
  { label: "이번 주", value: "weekly" },
  { label: "이번 달", value: "monthly" },
] as const;
type GithubSince = (typeof GITHUB_SINCE)[number]["value"];

const HF_CATEGORIES = [
  { label: "Models", value: "models" },
  { label: "Datasets", value: "datasets" },
  { label: "Spaces", value: "spaces" },
] as const;
type HFCategory = (typeof HF_CATEGORIES)[number]["value"];

function SummaryLoader() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mt-1.5 shrink-0" />
          <div className={`h-3.5 bg-slate-100 rounded animate-pulse flex-1 ${i === 4 ? "w-2/3" : "w-full"}`} />
        </div>
      ))}
    </div>
  );
}

function SummaryList({ summary }: { summary: string }) {
  const lines = summary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  return (
    <ul className="space-y-2.5">
      {lines.map((line, i) => {
        const text = line.replace(/^[•\-]\s*/, "").replace(/\*\*/g, "").trim();
        if (!text) return null;
        const match = text.match(/^\[(.+?)\]\s*[:\-]\s*(.*)/);
        const label = match?.[1] ?? null;
        const body = match ? match[2].trim() : text;
        return (
          <li key={i} className="flex gap-2.5 items-start">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
            <span className="text-sm text-slate-700 leading-relaxed">
              {label && <span className="font-semibold text-indigo-700">[{label}]</span>}
              {label ? " " : ""}{body}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function useSummary(path: string) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [attempted, setAttempted] = useState(false);

  // URL이 바뀌면 이전 결과 초기화
  useEffect(() => {
    setSummary("");
    setAttempted(false);
    setLastUpdated(null);
  }, [path]);

  const fetch_ = useCallback(() => {
    setLoading(true);
    apiFetch<{ summary: string }>(path)
      .then((data) => {
        setSummary(data.summary ?? "");
        setLastUpdated(new Date());
      })
      .catch(() => setSummary(""))
      .finally(() => {
        setLoading(false);
        setAttempted(true);
      });
  }, [path]);

  return { summary, loading, lastUpdated, attempted, refresh: fetch_ };
}

export function SummaryCard() {
  const [tab, setTab] = useState<Tab>("news");
  const [githubSince, setGithubSince] = useState<GithubSince>("daily");
  const [hfCategory, setHfCategory] = useState<HFCategory>("models");

  const news = useSummary(`/news/summary`);
  const github = useSummary(`/news/github-summary?since=${githubSince}`);
  const hf = useSummary(`/news/hf-summary?category=${hfCategory}`);

  // 첫 탭(뉴스)은 마운트 시 자동 로드
  useEffect(() => { news.refresh(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // 탭 전환 시 미로드된 탭만 fetch
  useEffect(() => {
    if (tab === "github" && !github.attempted && !github.loading) github.refresh();
    if (tab === "hf" && !hf.attempted && !hf.loading) hf.refresh();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // GitHub since 변경 시 재요청
  useEffect(() => {
    if (tab === "github") github.refresh();
  }, [githubSince]); // eslint-disable-line react-hooks/exhaustive-deps

  // HF category 변경 시 재요청
  useEffect(() => {
    if (tab === "hf") hf.refresh();
  }, [hfCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = tab === "news" ? news : tab === "github" ? github : hf;

  return (
    <div className="glass-panel rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-slate-700 whitespace-nowrap">AI 트렌드 브리핑</h2>
          <span className="text-2xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold shrink-0">AI</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {active.lastUpdated && (
            <span className="hidden sm:inline text-xs font-medium text-slate-400">
              {active.lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
            </span>
          )}
          <button
            onClick={active.refresh}
            disabled={active.loading}
            className="text-xs2 font-medium text-slate-400 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {active.loading ? "⟳ 갱신 중..." : "⟳ 새로고침"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`text-xs2 font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              tab === t.value
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-filters */}
      {tab === "github" && (
        <div className="flex gap-1 mb-3">
          {GITHUB_SINCE.map((o) => (
            <button
              key={o.value}
              onClick={() => setGithubSince(o.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                githubSince === o.value
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {tab === "hf" && (
        <div className="flex gap-1 mb-3">
          {HF_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setHfCategory(c.value)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                hfCategory === c.value
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {!active.attempted || active.loading ? (
        <SummaryLoader />
      ) : active.summary ? (
        <SummaryList summary={active.summary} />
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
          <p className="text-xs">브리핑을 불러올 수 없습니다</p>
          <button onClick={active.refresh} className="text-xs text-indigo-600 hover:underline mt-1">
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
