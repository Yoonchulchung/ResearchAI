"use client";

import { useEffect, useState } from "react";
import {
  analyzeCompanyFinancialStatements,
  getCompanyFinancialAiHistory,
  type CompanyFinancialAiAnalysis,
} from "@/lib/api/companies";
import { getModels } from "@/lib/api/research";
import type { ModelDefinition } from "@/types";

type HistoryItem = CompanyFinancialAiAnalysis & { id: string; createdAt: string };

interface Props {
  companyId: string;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

const DIRECTION_LABELS = {
  improving: "개선",
  worsening: "악화",
  mixed: "혼재",
  stable: "유지",
} as const;

const DIRECTION_COLORS = {
  improving: "text-emerald-500",
  worsening: "text-rose-500",
  mixed: "text-amber-500",
  stable: "text-sky-500",
} as const;

function formatCost(value: number) {
  if (!value) return "$0";
  return `$${value.toFixed(6)}`;
}

export function FinancialAiAnalysis({
  companyId,
  isDark,
  panelClass,
  subtleText,
}: Props) {
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [result, setResult] = useState<HistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getModels()
      .then((items) => {
        if (cancelled) return;
        const cloud = items.filter(
          (item) => item.provider !== "ollama" && item.provider !== "llama-cpp",
        );
        const available = cloud.length ? cloud : items;
        const haiku = available.find((item) =>
          item.id.toLowerCase().includes("haiku"),
        );
        setModels(available);
        setSelectedModel(haiku?.id ?? available[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    getCompanyFinancialAiHistory(companyId, 1)
      .then((items) => {
        if (cancelled) return;
        setResult(items[0] ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const handleAnalyze = async () => {
    if (!selectedModel || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await analyzeCompanyFinancialStatements(companyId, selectedModel);
      setResult({ ...res, id: res.analyzedAt, createdAt: res.analyzedAt });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "재무제표를 해석하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`rounded-md border p-4 ${panelClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">AI 재무제표 해석</h3>
          <p className={`mt-1 text-xs ${subtleText}`}>
            DART 연간 재무 데이터와 현재 시장 지표를 바탕으로 수익성·성장성·
            안정성·현금흐름을 설명합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            disabled={loading}
            className={`h-8 min-w-44 rounded border px-2 text-xs font-semibold outline-none ${
              isDark
                ? "border-white/10 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {models.length ? (
              models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            ) : (
              <option value="">모델 없음</option>
            )}
          </select>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading || !selectedModel}
            className={`h-8 rounded-md px-3 text-xs font-bold transition-colors ${
              loading || !selectedModel
                ? "cursor-wait bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-white/30"
                : isDark
                  ? "bg-white text-slate-950 hover:bg-white/90"
                  : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            {loading ? "해석 중..." : result ? "다시 해석" : "AI 해석"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
          {error}
        </p>
      ) : null}

      {!result && !loading ? (
        <div
          className={`mt-4 rounded-md border border-dashed px-4 py-8 text-center text-sm ${
            isDark
              ? "border-white/10 text-white/35"
              : "border-slate-200 text-slate-400"
          }`}
        >
          {historyLoading
            ? "이전 분석 결과를 불러오는 중..."
            : "AI 해석을 실행하면 숫자가 의미하는 변화와 확인할 지점을 정리합니다."}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <div
            className={`rounded-md border px-4 py-3 text-sm leading-6 ${
              isDark
                ? "border-indigo-300/15 bg-indigo-300/[0.06]"
                : "border-indigo-100 bg-indigo-50/60"
            }`}
          >
            {result.overview}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div
              className={`rounded-md border p-3 ${
                isDark
                  ? "border-emerald-400/15 bg-emerald-400/[0.04]"
                  : "border-emerald-100 bg-emerald-50/40"
              }`}
            >
              <h4 className="text-xs font-black text-emerald-500">강점</h4>
              <ul className="mt-2 space-y-2 text-xs leading-5">
                {result.strengths.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div
              className={`rounded-md border p-3 ${
                isDark
                  ? "border-rose-400/15 bg-rose-400/[0.04]"
                  : "border-rose-100 bg-rose-50/40"
              }`}
            >
              <h4 className="text-xs font-black text-rose-500">주의점</h4>
              <ul className="mt-2 space-y-2 text-xs leading-5">
                {result.concerns.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>

          {result.trends.length ? (
            <div>
              <h4 className="text-xs font-black">주요 추세</h4>
              <div className="mt-2 grid gap-2">
                {result.trends.map((trend) => (
                  <div
                    key={`${trend.label}-${trend.evidence}`}
                    className={`rounded-md border px-3 py-2 ${
                      isDark
                        ? "border-white/10 bg-white/[0.03]"
                        : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black">{trend.label}</span>
                      <span
                        className={`ml-auto text-xs font-black ${DIRECTION_COLORS[trend.direction]}`}
                      >
                        {DIRECTION_LABELS[trend.direction]}
                      </span>
                    </div>
                    <p className={`mt-1 text-xs leading-5 ${subtleText}`}>
                      {trend.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result.checkpoints.length ? (
            <div>
              <h4 className="text-xs font-black">다음 공시에서 확인할 점</h4>
              <ul
                className={`mt-2 space-y-1.5 text-xs leading-5 ${subtleText}`}
              >
                {result.checkpoints.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            className={`flex flex-wrap justify-between gap-2 border-t pt-3 text-[10px] ${subtleText} ${
              isDark ? "border-white/10" : "border-slate-100"
            }`}
          >
            <span>
              {result.model} · 입력 {result.inputTokens.toLocaleString()} · 출력{" "}
              {result.outputTokens.toLocaleString()} 토큰 · 예상 비용{" "}
              {formatCost(result.estimatedFees)}
            </span>
            <span>AI 해석은 공시 이해를 돕기 위한 참고 정보입니다.</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
