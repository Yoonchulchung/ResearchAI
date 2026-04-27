"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/base";
import { useTheme } from "@/contexts/ThemeContext";

interface ResearchHit {
  score: number;
  taskTitle: string;
  text: string;
}

interface ExperienceHit {
  score: number;
  title: string;
  text: string;
}

interface DocumentHit {
  score: number;
  filename: string;
  fileType: string;
  chunkIndex: number;
  text: string;
}

interface DebugResult {
  query: string;
  collections: {
    research_rag: ResearchHit[];
    experience_rag: ExperienceHit[];
    document_rag: DocumentHit[];
  };
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70 ? "bg-green-100 text-green-700" :
    pct >= 45 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold ${color}`}>
      {pct}%
    </span>
  );
}

function HitCard({ hit, label }: { hit: { score: number; text: string; [key: string]: any }; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className={`rounded-md border px-4 py-3 space-y-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white/80" : "text-slate-700"}`}>{label}</span>
        <ScoreBadge score={hit.score} />
      </div>
      <p className={`text-xs leading-relaxed ${isDark ? "text-white/50" : "text-slate-500"} ${expanded ? "" : "line-clamp-3"}`}>
        {hit.text}
      </p>
      {hit.text.length > 200 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`text-2xs ${isDark ? "text-white/30 hover:text-white/60" : "text-slate-400 hover:text-slate-600"}`}
        >
          {expanded ? "접기" : "전체 보기"}
        </button>
      )}
    </div>
  );
}

function CollectionSection({
  title,
  badge,
  hits,
  empty,
  renderLabel,
}: {
  title: string;
  badge: string;
  hits: any[];
  empty: string;
  renderLabel: (hit: any) => string;
}) {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-700"}`}>{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"}`}>{badge}</span>
        <span className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{hits.length}건</span>
      </div>
      {hits.length === 0 ? (
        <p className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>{empty}</p>
      ) : (
        <div className="space-y-2">
          {hits.map((hit, i) => (
            <HitCard key={i} hit={hit} label={renderLabel(hit)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RagDebugPanel() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";

  const [query, setQuery] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugResult | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<DebugResult>("/vector/debug", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), sessionId: sessionId.trim() || undefined, topK }),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
    isDark ? "bg-white/5 border-white/10 text-white placeholder:text-white/30" : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-300"
  }`;

  return (
    <div className="space-y-6">
      {/* 검색 입력 */}
      <div className={`rounded-lg shadow-sm border p-5 space-y-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>검색 쿼리</label>
          <input
            className={inputCls}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="RAG 검색할 질문을 입력하세요"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>
              Session ID <span className={`font-normal ${isDark ? "text-white/30" : "text-slate-400"}`}>(research_rag 검색용, 선택)</span>
            </label>
            <input
              className={inputCls}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="세션 ID (없으면 research_rag 스킵)"
            />
          </div>
          <div className="w-24">
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-white/60" : "text-slate-500"}`}>Top K</label>
            <input
              type="number"
              min={1}
              max={20}
              className={inputCls}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="w-full py-2 rounded-md bg-slate-50 text-slate-8000 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          {loading ? "검색 중..." : "RAG 검색 실행"}
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* 결과 */}
      {result && (
        <div className="space-y-6">
          {/* 요약 바 */}
          <div className={`rounded-md border px-5 py-3 flex gap-6 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
            {[
              { label: "research_rag", count: result.collections.research_rag.length },
              { label: "experience_rag", count: result.collections.experience_rag.length },
              { label: "document_rag", count: result.collections.document_rag.length },
            ].map(({ label, count }) => (
              <div key={label}>
                <p className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{label}</p>
                <p className={`text-lg font-bold font-mono ${count > 0 ? (isDark ? "text-white" : "text-slate-800") : (isDark ? "text-white/20" : "text-slate-300")}`}>
                  {count}
                </p>
              </div>
            ))}
            <div className="ml-auto flex items-center">
              <p className={`text-xs font-mono ${isDark ? "text-white/30" : "text-slate-400"}`}>"{result.query}"</p>
            </div>
          </div>

          <CollectionSection
            title="리서치 결과 (research_rag)"
            badge="research_rag"
            hits={result.collections.research_rag}
            empty={sessionId ? "매칭 결과 없음 — score_threshold(0.3) 미달" : "Session ID를 입력하면 검색됩니다"}
            renderLabel={(h) => h.taskTitle}
          />

          <CollectionSection
            title="경험 (experience_rag)"
            badge="experience_rag"
            hits={result.collections.experience_rag}
            empty="매칭 결과 없음 — score_threshold(0.2) 미달"
            renderLabel={(h) => h.title}
          />

          <CollectionSection
            title="첨부 문서 (document_rag)"
            badge="document_rag"
            hits={result.collections.document_rag}
            empty="매칭 결과 없음 — score_threshold(0.3) 미달 또는 문서 미업로드"
            renderLabel={(h) => `${h.filename} · chunk #${h.chunkIndex}`}
          />
        </div>
      )}
    </div>
  );
}
