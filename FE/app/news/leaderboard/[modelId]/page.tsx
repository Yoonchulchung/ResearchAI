"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getModelById,
  CATEGORY_LABELS,
  CATEGORY_SCORE_LABEL,
  CATEGORY_BENCHMARK_DESC,
  CATEGORY_DATA_SOURCES,
  MODEL_TYPE_LABELS,
  type AiModelEntry,
} from "@/lib/api/ai-leaderboard";

function BenchmarkCard({ label, value, isDark }: { label: string; value: number | null; isDark: boolean }) {
  const score = value ?? 0;
  const color = score >= 70 ? "emerald" : score >= 45 ? "amber" : "red";
  const barColors = {
    emerald: { bg: isDark ? "bg-emerald-500/20" : "bg-emerald-50", bar: "bg-emerald-500", text: isDark ? "text-emerald-300" : "text-emerald-700" },
    amber:   { bg: isDark ? "bg-amber-500/20" : "bg-amber-50",     bar: "bg-amber-500",   text: isDark ? "text-amber-300"   : "text-amber-700"   },
    red:     { bg: isDark ? "bg-red-500/20" : "bg-red-50",         bar: "bg-red-500",     text: isDark ? "text-red-300"     : "text-red-600"     },
  }[color];

  return (
    <div className={`rounded-xl p-4 ${isDark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white"}`}>
      <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-white/40" : "text-slate-400"}`}>{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${value == null ? (isDark ? "text-white/20" : "text-slate-300") : barColors.text}`}>
        {value != null ? value.toFixed(1) : "—"}
      </div>
      <div className={`mt-2 h-1.5 w-full rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
        <div className={`h-full rounded-full transition-all ${value != null ? barColors.bar : ""}`} style={{ width: `${Math.min(Math.abs(score), 100)}%` }} />
      </div>
    </div>
  );
}

function getBenchmarkValue(model: AiModelEntry, key: string): number | null {
  // Try direct field first (LLM-specific columns), then benchmarks map
  if (key in model) return (model as unknown as Record<string, unknown>)[key] as number | null;
  return model.benchmarks?.[key] ?? null;
}

export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const modelId = decodeURIComponent(params.modelId);
  const [model, setModel] = useState<AiModelEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getModelById(modelId)
      .then(setModel)
      .catch((e) => setError(e instanceof Error ? e.message : "모델 정보를 불러오지 못했습니다."));
  }, [modelId]);

  const pageBase = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";
  const panelClass = isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";

  const category = model?.category ?? "llm";
  const categoryLabel = CATEGORY_LABELS[category] ?? category;
  const scoreLabel = CATEGORY_SCORE_LABEL[category] ?? "점수";
  const benchmarkDescs = CATEGORY_BENCHMARK_DESC[category] ?? [];
  const dataSources = CATEGORY_DATA_SOURCES[category] ?? [];

  const hfUrl = model ? `https://huggingface.co/${model.fullname}` : null;

  return (
    <main className={`h-full overflow-y-auto ${pageBase}`}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <button onClick={() => router.push("/news")} className={`font-semibold ${isDark ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}>뉴스</button>
          <span className={textSub}>/</span>
          <button onClick={() => router.push("/news/leaderboard")} className={`font-semibold ${isDark ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}>리더보드</button>
          <span className={textSub}>/</span>
          <span className={`max-w-50 truncate font-semibold ${textMain}`}>{model?.modelName ?? "..."}</span>
        </div>

        {error ? (
          <div className={`rounded-xl border p-6 text-center text-sm ${isDark ? "border-red-900/40 bg-red-950/30 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>
        ) : !model ? (
          <div className="space-y-4">
            {[80, 60, 40].map((w) => <div key={w} className={`h-8 animate-pulse rounded-xl ${isDark ? "bg-white/10" : "bg-slate-200"}`} style={{ width: `${w}%` }} />)}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header card */}
            <div className={`rounded-2xl border p-6 ${panelClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-2xs font-bold ${isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-700"}`}>
                      #{model.rank}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-700"}`}>
                      {categoryLabel}
                    </span>
                    {model.modelType && (
                      <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500"}`}>
                        {MODEL_TYPE_LABELS[model.modelType] ?? model.modelType}
                      </span>
                    )}
                    {model.license && <span className={`text-2xs ${textSub}`}>{model.license}</span>}
                  </div>
                  <h1 className={`text-xl font-bold leading-snug ${textMain}`}>{model.modelName}</h1>
                  <p className={`mt-1 text-sm ${textSub}`}>{model.org}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-3xl font-bold tabular-nums ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
                    {model.average?.toFixed(2) ?? "—"}
                  </div>
                  <div className={`text-xs ${textSub}`}>{scoreLabel}</div>
                </div>
              </div>

              {/* Meta */}
              <div className={`mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm ${isDark ? "border-white/10" : "border-slate-100"}`}>
                {model.params != null && (
                  <div>
                    <div className={`text-xs ${textSub}`}>파라미터</div>
                    <div className={`font-semibold ${textMain}`}>
                      {model.params >= 1 ? `${model.params.toFixed(1)}B` : `${(model.params * 1000).toFixed(0)}M`}
                    </div>
                  </div>
                )}
                {model.architecture && (
                  <div>
                    <div className={`text-xs ${textSub}`}>아키텍처</div>
                    <div className={`font-semibold ${textMain}`}>{model.architecture}</div>
                  </div>
                )}
                {model.likes != null && (
                  <div>
                    <div className={`text-xs ${textSub}`}>HF 좋아요</div>
                    <div className={`font-semibold ${textMain}`}>❤️ {model.likes.toLocaleString()}</div>
                  </div>
                )}
                {model.fetchedAt && (
                  <div>
                    <div className={`text-xs ${textSub}`}>데이터 기준</div>
                    <div className={`font-semibold ${textMain}`}>{new Date(model.fetchedAt).toLocaleDateString("ko-KR")}</div>
                  </div>
                )}
                {model.sourceCount > 0 && (
                  <div>
                    <div className={`text-xs ${textSub}`}>반영 출처</div>
                    <div className={`font-semibold ${textMain}`}>{model.sourceCount}개</div>
                  </div>
                )}
              </div>
            </div>

            {Object.keys(model.sourceScores ?? {}).length > 0 && (
              <div className={`rounded-2xl border p-4 ${panelClass}`}>
                <p className={`mb-3 text-xs font-semibold ${textSub}`}>출처별 반영 점수</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(model.sourceScores).map(([source, score]) => (
                    <div key={source} className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                      <div className={`text-xs ${textSub}`}>{source}</div>
                      <div className={`mt-1 text-lg font-bold tabular-nums ${textMain}`}>{score != null ? score.toFixed(2) : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Benchmark scores */}
            {benchmarkDescs.length > 0 && (
              <div>
                <h2 className={`mb-3 text-sm font-bold uppercase tracking-wide ${textSub}`}>벤치마크 점수</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {benchmarkDescs.map(({ key, name }) => (
                    <BenchmarkCard key={key} label={name} value={getBenchmarkValue(model, key)} isDark={isDark} />
                  ))}
                </div>
              </div>
            )}

            {/* Benchmark descriptions */}
            {benchmarkDescs.length > 0 && (
              <div className={`rounded-2xl border p-4 text-xs ${panelClass} ${textSub}`}>
                <p className={`mb-2 font-semibold ${textMain}`}>벤치마크 설명</p>
                <ul className="space-y-1">
                  {benchmarkDescs.map(({ key, name, desc }) => (
                    <li key={key}><b className={textMain}>{name}</b> — {desc}</li>
                  ))}
                </ul>
                {category === "asr" && (
                  <p className="mt-2 text-2xs italic">※ ASR 점수는 100 - WER(단어 오류율)로 변환된 값입니다. 높을수록 인식 정확도가 높습니다.</p>
                )}
                {category === "text-to-image" && (
                  <p className="mt-2 text-2xs italic">※ 공개 벤치마크 미지원 카테고리입니다. HuggingFace 인기 지표를 기준으로 표시됩니다.</p>
                )}
              </div>
            )}

            {/* Data sources */}
            {dataSources.length > 0 && (
              <div className={`rounded-2xl border p-4 ${panelClass}`}>
                <p className={`mb-2 text-xs font-semibold ${textSub}`}>데이터 출처</p>
                <div className="flex flex-col gap-2">
                  {dataSources.map((src) => (
                    <a
                      key={src.url}
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${isDark ? "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5 shrink-0">
                        <path d="M1.5 8.5L8.5 1.5M8.5 1.5H4.5M8.5 1.5V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div>
                        <div className="font-semibold">{src.name}</div>
                        {src.note && <div className={`mt-0.5 ${isDark ? "text-white/35" : "text-slate-400"}`}>{src.note}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* HF link */}
            {hfUrl && (
              <a
                href={hfUrl}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition ${isDark ? "border-white/10 text-white/60 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
                HuggingFace에서 보기
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
