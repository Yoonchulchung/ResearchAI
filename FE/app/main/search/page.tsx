"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getSearchRoadmap, expandRoadmap, getQueryNews, createSearchAnswerSSE, getWebSearch,
  type SearchRoadmapResult, type SearchRoadmapMonth,
  type QueryNewsItem, type WebSearchItem,
} from "@/lib/api/news-feed";
import type { NewsItem } from "@/lib/api/news-feed";
import {
  groupNewsByDailyTopic,
  type DailyNewsTopicGroup,
} from "@/news/_lib/news-topic-groups";

/* ── 날짜 파싱 ── */
interface ParsedQuery {
  cleanQuery: string;  // 날짜 텍스트 제거된 순수 검색어
  dateFrom?: string;   // YYYY-MM-DD
  dateTo?: string;     // YYYY-MM-DD
  dateLabel?: string;  // UI 표시용
}

function parseDateFromQuery(raw: string): ParsedQuery {
  let q = raw.trim();
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  let dateLabel: string | undefined;
  const now = new Date();

  // 2026년 05월 / 2026년 5월
  const ymMatch = q.match(/(\d{4})년\s*0?(\d{1,2})월/);
  if (ymMatch) {
    const year = Number(ymMatch[1]);
    const month = Number(ymMatch[2]);
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    dateFrom = `${year}-${mm}-01`;
    dateTo = `${year}-${mm}-${lastDay}`;
    dateLabel = `${year}년 ${mm}월`;
    q = q.replace(ymMatch[0], "").replace(/\s{2,}/g, " ").trim();
  } else {
    // 2026년
    const yMatch = q.match(/(\d{4})년/);
    if (yMatch) {
      dateFrom = `${yMatch[1]}-01-01`;
      dateTo = `${yMatch[1]}-12-31`;
      dateLabel = `${yMatch[1]}년`;
      q = q.replace(yMatch[0], "").replace(/\s{2,}/g, " ").trim();
    }
  }

  // 상대 날짜 (날짜가 아직 없을 때만)
  if (!dateFrom) {
    if (/올해|이번\s*해/.test(q)) {
      dateFrom = `${now.getFullYear()}-01-01`;
      dateTo = `${now.getFullYear()}-12-31`;
      dateLabel = `${now.getFullYear()}년`;
      q = q.replace(/올해|이번\s*해/, "").replace(/\s{2,}/g, " ").trim();
    } else if (/작년|지난\s*해/.test(q)) {
      const y = now.getFullYear() - 1;
      dateFrom = `${y}-01-01`; dateTo = `${y}-12-31`; dateLabel = `${y}년`;
      q = q.replace(/작년|지난\s*해/, "").replace(/\s{2,}/g, " ").trim();
    } else if (/이번\s*달/.test(q)) {
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      dateFrom = `${now.getFullYear()}-${mm}-01`;
      dateTo = `${now.getFullYear()}-${mm}-${last}`;
      dateLabel = `${now.getFullYear()}년 ${mm}월`;
      q = q.replace(/이번\s*달/, "").replace(/\s{2,}/g, " ").trim();
    } else if (/지난\s*달|저번\s*달/.test(q)) {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const mm = String(prev.getMonth() + 1).padStart(2, "0");
      const last = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      dateFrom = `${prev.getFullYear()}-${mm}-01`;
      dateTo = `${prev.getFullYear()}-${mm}-${last}`;
      dateLabel = `${prev.getFullYear()}년 ${mm}월`;
      q = q.replace(/지난\s*달|저번\s*달/, "").replace(/\s{2,}/g, " ").trim();
    }
  }

  // 최근 N일
  if (!dateFrom) {
    const recentMatch = q.match(/최근\s*(\d+)\s*일/);
    if (recentMatch) {
      const days = Number(recentMatch[1]);
      const from = new Date(now); from.setDate(now.getDate() - days);
      dateFrom = from.toISOString().substring(0, 10);
      dateTo = now.toISOString().substring(0, 10);
      dateLabel = `최근 ${days}일`;
      q = q.replace(recentMatch[0], "").replace(/\s{2,}/g, " ").trim();
    }
  }

  return { cleanQuery: q || raw, dateFrom, dateTo, dateLabel };
}

/* ── 유틸 ── */
function getDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}
function toYM(iso: string | null) {
  return iso ? iso.substring(0, 7) : "";
}

/* ── 타입별 색 ── */
const TYPE_COLORS: Record<string, string> = {
  event: "#3b82f6", policy: "#10b981", economy: "#f97316",
  tech: "#8b5cf6", international: "#eab308", social: "#ef4444", person: "#06b6d4",
};

/* ════════════════════════════════════════
   AI 답변 패널 (검색 결과 기반)
════════════════════════════════════════ */
function AiAnswerPanel({
  query, dateFrom, dateTo, isDark,
}: {
  query: string; dateFrom?: string; dateTo?: string; isDark: boolean;
}) {
  const [text, setText]         = useState("");
  const [sources, setSources]   = useState<QueryNewsItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [model, setModel]       = useState("");
  const [error, setError]       = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setText(""); setSources([]); setLoading(true); setModel(""); setError("");
    esRef.current?.close();

    const es = createSearchAnswerSSE(query, dateFrom, dateTo);
    esRef.current = es;
    let settled = false;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "sources") {
        const seen = new Set<string>();
        setSources((data.items ?? []).filter((s: QueryNewsItem) => {
          if (seen.has(s.url)) return false;
          seen.add(s.url);
          return true;
        }));
      }
      else if (data.type === "chunk") setText((p) => p + data.text);
      else if (data.type === "done") {
        settled = true;
        setLoading(false);
        setModel(data.model ?? "");
        es.close();
      } else if (data.type === "error") {
        settled = true;
        setError(data.message ?? "오류");
        setLoading(false);
        es.close();
      }
    };
    es.onerror = () => {
      if (settled) return;
      setError("연결 오류");
      setLoading(false);
      es.close();
    };

    return () => { es.close(); esRef.current = null; };
  }, [query, dateFrom, dateTo]);

  const textPri  = isDark ? "text-white/85"  : "text-slate-800";
  const textMuted = isDark ? "text-white/40" : "text-slate-500";
  const panelBg  = isDark ? "bg-slate-900/80 border-white/10" : "bg-white border-slate-200";
  const codeBg   = isDark ? "bg-black/30"   : "bg-slate-50";

  // 간단한 마크다운 렌더링 (## 제목, **굵게**, - 목록, [n] 출처)
  const renderMd = (md: string) => {
    return md.split("\n").map((line, i) => {
      if (/^##\s+/.test(line)) {
        return <p key={i} className={`mt-3 mb-1 text-base font-black ${textPri}`}>{line.replace(/^##\s+/, "")}</p>;
      }
      if (/^###\s+/.test(line)) {
        return <p key={i} className={`mt-2 mb-0.5 text-sm font-black ${textPri}`}>{line.replace(/^###\s+/, "")}</p>;
      }
      if (/^-\s+/.test(line)) {
        const inner = line.replace(/^-\s+/, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
        return <li key={i} className={`ml-4 text-sm leading-relaxed ${textPri}`} dangerouslySetInnerHTML={{ __html: inner }} />;
      }
      if (!line.trim()) return <div key={i} className="h-2" />;
      const inner = line
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/\[(\d+)\]/g, `<span class="inline-flex items-center justify-center h-4 w-5 rounded text-2xs font-black bg-indigo-500/20 text-indigo-400 mx-0.5">$1</span>`);
      return <p key={i} className={`text-sm leading-relaxed ${textPri}`} dangerouslySetInnerHTML={{ __html: inner }} />;
    });
  };

  return (
    <div className={`shrink-0 overflow-hidden rounded-xl border shadow-sm ${panelBg}`}>
      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors ${
          isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
        }`}
      >
        <span className="text-sm">✦</span>
        <span className={`text-sm font-bold ${textPri}`}>AI 답변</span>
        {loading && (
          <span className={`flex items-center gap-1 text-xs ${textMuted}`}>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            분석 중...
          </span>
        )}
        {!loading && sources.length > 0 && (
          <span className={`text-xs ${textMuted}`}>
            {sources.filter(s => s.itemType === 'web').length > 0
              ? `웹 ${sources.filter(s => s.itemType === 'web').length} + 뉴스 ${sources.filter(s => s.itemType === 'news').length}건 참고`
              : `${sources.length}건 참고`}
          </span>
        )}
        {!loading && model && (
          <span className={`ml-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${
            isDark ? "border-white/10 bg-white/5 text-white/40" : "border-slate-200 bg-slate-100 text-slate-400"
          }`}>
            by {model.startsWith("gemini") ? "Gemini" : model.startsWith("claude") ? "Claude" : model.split("-")[0]}
          </span>
        )}
        <span className={`ml-auto text-xs transition-transform ${collapsed ? "" : "rotate-180"} ${textMuted}`}>▼</span>
      </button>

      {!collapsed && (
        <div className={`border-t ${isDark ? "border-white/8" : "border-slate-100"}`}>
          {error ? (
            <p className="px-4 py-3 text-xs text-red-400">{error}</p>
          ) : (
            <>
              {/* AI 답변 본문 */}
              <div className={`max-h-64 overflow-y-auto px-4 py-3 ${codeBg}`} style={{ scrollbarWidth: "thin" }}>
                {text ? (
                  <div className="space-y-0.5">{renderMd(text)}</div>
                ) : loading ? (
                  <div className="space-y-2">
                    {[80, 60, 90, 50].map((w, i) => (
                      <div key={i} className={`h-3 animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : null}
                {loading && text && (
                  <span className="inline-block h-3.5 w-0.5 animate-pulse bg-indigo-400 align-middle" />
                )}
              </div>

              {/* 참고 기사 목록 */}
              {sources.length > 0 && (
                <div className={`flex gap-2 overflow-x-auto px-4 py-2 ${isDark ? "border-t border-white/5" : "border-t border-slate-100"}`}
                  style={{ scrollbarWidth: "none" }}
                >
                  {sources.map((s, i) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                        isDark
                          ? "border-white/8 bg-white/4 text-white/50 hover:border-indigo-400/40 hover:text-indigo-300"
                          : "border-slate-100 bg-slate-50 text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-2xs font-black ${
                        isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-100 text-indigo-600"
                      }`}>{i + 1}</span>
                      {s.itemType === 'news' && (
                        <span className={`shrink-0 rounded px-1 text-2xs font-semibold ${
                          isDark ? "bg-sky-500/20 text-sky-400" : "bg-sky-100 text-sky-600"
                        }`}>뉴스</span>
                      )}
                      <span className="max-w-[140px] truncate">{s.source || new URL(s.url).hostname.replace("www.", "")}</span>
                      {s.publishedAt && <span className={`shrink-0 text-2xs ${textMuted}`}>{s.publishedAt.substring(5)}</span>}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   가로 타임라인
════════════════════════════════════════ */
function HorizontalTimeline({
  data, isDark, query,
  onExpandOlder, onExpandNewer, expandingDir,
}: {
  data: SearchRoadmapResult;
  isDark: boolean;
  query: string;
  onExpandOlder: () => void;
  onExpandNewer: () => void;
  expandingDir: "older" | "newer" | null;
}) {
  const months = [...data.months].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  if (months.length === 0) return null;

  const textPri  = isDark ? "text-white/85" : "text-slate-800";
  const cardBg   = isDark ? "bg-white/5 border-white/10" : "bg-white border-slate-100";
  const lineBg   = isDark ? "bg-white/15" : "bg-slate-200";
  const textMuted = isDark ? "text-white/40" : "text-slate-400";

  const PlusBtn = ({ onClick, loading, title }: { onClick: () => void; loading: boolean; title: string }) => (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xl font-light shadow-sm transition-all self-start mt-3 ${
        loading
          ? "cursor-wait border-slate-200 bg-slate-100 text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/20"
          : isDark
            ? "border-white/20 bg-slate-900 text-white/70 hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-500/15 hover:text-indigo-300"
            : "border-slate-200 bg-white text-slate-500 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
      }`}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : "+"}
    </button>
  );

  return (
    <div className="h-full overflow-x-auto overflow-y-auto pb-1" style={{ scrollbarWidth: "thin" }}>
      <div className="flex h-max items-start gap-0 min-w-max py-2 px-1">

        {/* ← 이전 데이터 + 버튼 */}
        <div className="flex flex-col items-center mr-3">
          <PlusBtn
            onClick={onExpandOlder}
            loading={expandingDir === "older"}
            title={`${months[0].yearMonth} 이전 뉴스 더 가져오기 (네이버)`}
          />
          <span className={`mt-1 text-2xs ${textMuted} text-center`} style={{ width: 40 }}>이전</span>
        </div>

        {months.map((month, mi) => (
          <div key={month.yearMonth} className="flex items-start">
            <div className="flex flex-col items-center" style={{ minWidth: 240, maxWidth: 260 }}>
              {/* 월 헤더 */}
              <div className="flex flex-col items-center">
                <span className={`mb-1 text-sm font-black ${textPri}`}>
                  {month.yearMonth.replace("-", ".")}
                </span>
                <div className={`h-3 w-3 rounded-full border-2 ${
                  isDark ? "border-indigo-400 bg-indigo-900" : "border-indigo-500 bg-indigo-100"
                }`} />
              </div>

              {/* 이벤트 카드들 */}
              <div className="mt-2 flex w-full flex-col gap-2 px-2">
                {month.events.map((ev, ei) => {
                  const color = TYPE_COLORS[ev.type] ?? "#94a3b8";
                  return (
                    <div
                      key={ei}
                      className={`rounded-lg border p-3 shadow-sm ${cardBg} ${
                        ev.importance === "high"
                          ? isDark ? "ring-1 ring-indigo-400/50" : "ring-1 ring-indigo-300"
                          : ""
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: color }}>
                          {ev.category}
                        </span>
                        {ev.importance === "high" && <span className="text-xs font-black text-red-400">★</span>}
                      </div>
                      <p className={`line-clamp-4 text-xs leading-relaxed ${textPri}`}>{ev.summary}</p>
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`mt-1.5 line-clamp-1 text-xs font-semibold transition-colors ${
                            isDark ? "text-blue-300 hover:text-blue-200" : "text-blue-600 hover:text-blue-700"
                          }`}
                        >
                          ↗ {ev.sourceTitle ?? "원문 보기"}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 연결선 */}
            {mi < months.length - 1 && (
              <div className="flex items-start pt-5.5">
                <div className={`h-0.5 w-5 ${lineBg}`} />
              </div>
            )}
          </div>
        ))}

        {/* → 최신 데이터 + 버튼 */}
        <div className="flex flex-col items-center ml-3">
          <PlusBtn
            onClick={onExpandNewer}
            loading={expandingDir === "newer"}
            title={`${months[months.length - 1].yearMonth} 이후 최신 뉴스 가져오기 (네이버)`}
          />
          <span className={`mt-1 text-2xs ${textMuted} text-center`} style={{ width: 40 }}>최신</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   로드맵 패널
════════════════════════════════════════ */
function RoadmapPanel({
  roadmap, loading, error, searched, isDark, query, onRoadmapUpdate,
}: {
  roadmap: SearchRoadmapResult | null;
  loading: boolean; error: string; searched: boolean; isDark: boolean; query: string;
  onRoadmapUpdate: (r: SearchRoadmapResult) => void;
}) {
  const [expandingDir, setExpandingDir] = useState<"older" | "newer" | null>(null);
  const [expandMsg, setExpandMsg] = useState("");

  const textMuted = isDark ? "text-white/40" : "text-slate-400";
  const panelBg   = isDark ? "bg-slate-900 border-white/10" : "bg-white border-slate-200";

  const handleExpand = async (direction: "older" | "newer") => {
    if (!roadmap || expandingDir) return;
    const months = [...roadmap.months].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    const refDate = direction === "older"
      ? `${months[0].yearMonth}-01`
      : `${months[months.length - 1].yearMonth}-01`;

    setExpandingDir(direction);
    setExpandMsg("");
    try {
      const result = await expandRoadmap({
        q: query,
        direction,
        refDate,
        existingMonths: roadmap.months,
      });
      setExpandMsg(`+${result.addedCount}건 수집 완료`);
      onRoadmapUpdate({ ...roadmap, months: result.months, newsCount: roadmap.newsCount + result.addedCount });
    } catch {
      setExpandMsg("확장 실패");
    } finally {
      setExpandingDir(null);
    }
  };

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-xl border shadow-sm ${panelBg}`}>
      {/* 헤더 */}
      <div className={`flex shrink-0 items-center gap-2 border-b px-4 py-3 ${
        isDark ? "border-white/8 bg-white/3" : "border-slate-100 bg-slate-50"
      }`}>
        <span className="text-base">✦</span>
        <span className={`text-sm font-bold ${isDark ? "text-white/85" : "text-slate-800"}`}>
          뉴스 기반 로드맵
        </span>
        {loading && (
          <span className={`ml-auto flex items-center gap-1.5 text-xs ${textMuted}`}>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            뉴스 수집 · AI 분석 중...
          </span>
        )}
        {roadmap && !loading && (
          <div className={`ml-auto flex items-center gap-2 text-2xs ${textMuted}`}>
            {expandMsg && <span className="text-emerald-500">{expandMsg}</span>}
            <span>뉴스 {roadmap.newsCount}건 분석</span>
            {roadmap.model && (
              <span className={`rounded-full border px-2 py-0.5 font-semibold ${
                isDark ? "border-white/10 bg-white/5 text-white/50" : "border-slate-200 bg-slate-100 text-slate-500"
              }`}>
                by {roadmap.model.startsWith("claude") ? "Claude" : roadmap.model.startsWith("gemini") ? "Gemini" : roadmap.model.startsWith("gpt") ? "GPT" : roadmap.model.split("-")[0]}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 px-3 pt-3 pb-2">
        {loading ? (
          <div className="flex h-full items-start gap-0 overflow-x-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start">
                <div className="flex flex-col items-center" style={{ minWidth: 240 }}>
                  <div className={`mb-1 h-4 w-16 animate-pulse rounded ${isDark ? "bg-white/15" : "bg-slate-200"}`} />
                  <div className={`h-3 w-3 animate-pulse rounded-full ${isDark ? "bg-white/20" : "bg-slate-300"}`} />
                  <div className="mt-2 w-full space-y-2 px-2">
                    {Array.from({ length: 2 }).map((_, j) => (
                      <div key={j} className={`h-24 animate-pulse rounded-lg ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
                    ))}
                  </div>
                </div>
                {i < 3 && <div className={`mt-5.5 h-0.5 w-5 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-400">{error}</p>
        ) : roadmap && roadmap.months.length > 0 ? (
          <HorizontalTimeline
            data={roadmap}
            isDark={isDark}
            query={query}
            onExpandOlder={() => handleExpand("older")}
            onExpandNewer={() => handleExpand("newer")}
            expandingDir={expandingDir}
          />
        ) : (
          <p className={`py-6 text-center text-sm ${textMuted}`}>
            {searched ? "로드맵을 생성할 뉴스가 없습니다." : "검색하면 뉴스 기반 로드맵이 표시됩니다"}
          </p>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   왼쪽 뉴스 카드
════════════════════════════════════════ */
function NewsCard({ item, isDark }: { item: QueryNewsItem; isDark: boolean }) {
  const textMuted = isDark ? "text-white/40" : "text-slate-400";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex gap-3 rounded border p-3 transition-colors group ${
        isDark ? "border-white/10 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"
      }`}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={`h-20 w-28 shrink-0 rounded-md border object-cover ${
            isDark ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50"
          }`}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className={`flex h-20 w-28 shrink-0 items-center justify-center rounded-md border text-2xs font-bold ${
          isDark ? "border-white/8 bg-white/4 text-white/20" : "border-slate-100 bg-slate-50 text-slate-300"
        }`}>
          NEWS
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className={`text-2xs ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
            {item.source || getDomain(item.url)}
          </p>
          {item.publishedAt && (
            <span className={`shrink-0 text-2xs ${textMuted}`}>{formatDate(item.publishedAt)}</span>
          )}
        </div>
        <h3 className={`mb-1 line-clamp-2 text-sm font-bold leading-snug transition-colors ${
          isDark ? "text-white/85 group-hover:text-indigo-300" : "text-slate-800 group-hover:text-indigo-600"
        }`}>
          {item.title}
        </h3>
        {item.snippet && (
          <p className={`line-clamp-2 text-xs leading-relaxed ${textMuted}`}>{item.snippet}</p>
        )}
      </div>
    </a>
  );
}

/* ── 주제 묶음 카드 ── */
function TopicGroupCard({ group, byUrl, isDark }: {
  group: DailyNewsTopicGroup;
  byUrl: Map<string, QueryNewsItem>;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const textMuted = isDark ? "text-white/40" : "text-slate-400";
  const items = group.items.map((i) => byUrl.get(i.link)).filter(Boolean) as QueryNewsItem[];
  const visible = expanded ? items : items.slice(0, 3);

  return (
    <section className={`overflow-hidden rounded-md border ${
      isDark ? "border-emerald-400/20 bg-emerald-400/4" : "border-emerald-100 bg-white"
    }`}>
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
          isDark ? "hover:bg-white/5" : "hover:bg-emerald-50/60"
        }`}
      >
        <span className={`rounded-md px-2 py-1 text-xs font-black ${
          isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
        }`}>{group.keyword}</span>
        <span className={`text-xs font-semibold ${textMuted}`}>같은 날 {items.length}건</span>
        <span className={`ml-auto text-2xs ${expanded ? "rotate-180" : ""} transition-transform ${textMuted}`}>▼</span>
      </button>
      <div className={isDark ? "border-t border-white/5" : "border-t border-slate-100"}>
        {visible.map((item, i) => (
          <a key={item.url} href={item.url} target="_blank" rel="noreferrer"
            className={`block px-3 py-2.5 transition-colors group ${
              i > 0 ? isDark ? "border-t border-white/5" : "border-t border-slate-100" : ""
            } ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`min-w-0 flex-1 text-xs font-bold leading-relaxed ${
                isDark ? "text-white/85 group-hover:text-emerald-300" : "text-slate-800 group-hover:text-emerald-700"
              }`}>{item.title}</p>
              {item.publishedAt && (
                <span className={`shrink-0 text-2xs ${textMuted}`}>{formatDate(item.publishedAt)}</span>
              )}
            </div>
            {item.snippet && (
              <p className={`mt-0.5 line-clamp-1 text-2xs leading-relaxed ${textMuted}`}>{item.snippet}</p>
            )}
          </a>
        ))}
        {!expanded && items.length > 3 && (
          <button type="button" onClick={() => setExpanded(true)}
            className={`w-full border-t px-3 py-2 text-xs font-semibold ${
              isDark ? "border-white/5 text-white/40 hover:bg-white/5" : "border-slate-100 text-slate-400 hover:bg-slate-50"
            }`}
          >
            {items.length - 3}건 더 보기
          </button>
        )}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════
   왼쪽 뉴스 목록 패널
════════════════════════════════════════ */
function NewsListPanel({
  items, loading, hasMore, loadMore, error, searched, isDark, groupTopics, setGroupTopics,
}: {
  items: QueryNewsItem[]; loading: boolean; hasMore: boolean;
  loadMore: () => void; error: string; searched: boolean; isDark: boolean;
  groupTopics: boolean; setGroupTopics: (v: boolean) => void;
}) {
  const textMuted = isDark ? "text-white/40" : "text-slate-400";
  const scrollRef = useRef<HTMLDivElement>(null);

  // 무한 스크롤 감지
  const loaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasMore && !loading) loadMore(); },
      { threshold: 0.1 },
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // topic grouping
  const newsItems: NewsItem[] = items.map((r) => ({
    title: r.title, link: r.url, source: r.source, pubDate: r.publishedAt ?? "",
    description: r.snippet, imageUrl: r.imageUrl,
  }));
  const topicGroups = groupNewsByDailyTopic(newsItems);
  const groupedCount = topicGroups.filter((g) => g.keyword !== null).length;
  const byUrl = new Map(items.map((r) => [r.url, r]));

  const days = groupTopics ? [...new Set(topicGroups.map((g) => g.dateKey))] : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 상단 컨트롤 */}
      {items.length > 0 && (
        <div className={`flex shrink-0 items-center justify-between border-b px-1 py-2 ${
          isDark ? "border-white/8" : "border-slate-100"
        }`}>
          <span className={`text-xs ${textMuted}`}>
            {groupTopics && groupedCount > 0 ? `${groupedCount}개 주제로 묶음` : `${items.length}건`}
          </span>
          <label className={`flex cursor-pointer items-center gap-1.5 text-xs font-bold ${textMuted}`}>
            <input
              type="checkbox"
              checked={groupTopics}
              onChange={(e) => setGroupTopics(e.target.checked)}
              className="h-3.5 w-3.5 accent-emerald-500"
            />
            동일 주제 묶기
          </label>
        </div>
      )}

      {/* 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {!searched && !loading && (
          <p className={`py-16 text-center text-sm ${textMuted}`}>검색어를 입력하고 Enter를 누르세요</p>
        )}

        {searched && items.length === 0 && !loading && !error && (
          <p className={`py-10 text-center text-sm ${textMuted}`}>검색 결과가 없습니다.</p>
        )}

        {error && <p className="py-8 text-center text-sm text-red-400">{error}</p>}

        {items.length > 0 && (
          groupTopics ? (
            <div className="space-y-4 py-1">
              {days.map((day) => {
                const dayGroups = topicGroups.filter((g) => g.dateKey === day);
                return (
                  <section key={day}>
                    <div className={`mb-2 flex items-center gap-2 px-1`}>
                      <span className={`text-xs font-black ${textMuted}`}>{day}</span>
                      <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                    </div>
                    <div className="flex flex-col gap-2">
                      {dayGroups.map((group) => {
                        const first = byUrl.get(group.items[0].link);
                        if (!first) return null;
                        return group.keyword ? (
                          <TopicGroupCard key={group.id} group={group} byUrl={byUrl} isDark={isDark} />
                        ) : (
                          <NewsCard key={group.id} item={first} isDark={isDark} />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {items.map((item, i) => <NewsCard key={item.url ?? i} item={item} isDark={isDark} />)}
            </div>
          )
        )}

        {/* 무한 스크롤 로더 */}
        <div ref={loaderRef} className="h-4" />
        {loading && (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex gap-3 rounded border p-3 ${
                isDark ? "border-white/8" : "border-slate-100"
              }`}>
                <div className={`h-20 w-28 shrink-0 animate-pulse rounded-md ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
                <div className="flex-1 space-y-2 pt-1">
                  <div className={`h-3 w-1/3 animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                  <div className={`h-4 w-full animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                  <div className={`h-4 w-5/6 animate-pulse rounded ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!hasMore && items.length > 0 && (
          <p className={`py-4 text-center text-xs ${textMuted}`}>모든 뉴스를 불러왔습니다.</p>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   메인 페이지
════════════════════════════════════════ */
function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [isDark, setIsDark] = useState(false);
  useEffect(() => { setIsDark(localStorage.getItem("theme") === "dark"); }, []);

  const [query, setQuery] = useState(initialQuery);
  const [searched, setSearched] = useState(false);
  const [groupTopics, setGroupTopics] = useState(true);
  const [parsedDate, setParsedDate] = useState<{ cleanQuery?: string; label?: string; from?: string; to?: string }>({});

  // 웹 검색 결과
  const [webItems, setWebItems]     = useState<WebSearchItem[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError]     = useState("");

  // 뉴스 목록 (무한 스크롤)
  const [newsItems, setNewsItems]   = useState<QueryNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError]   = useState("");
  const [newsHasMore, setNewsHasMore] = useState(false);
  const [nextStart, setNextStart]   = useState(1);

  // 로드맵
  const [roadmap, setRoadmap]               = useState<SearchRoadmapResult | null>(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError]     = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const currentQueryRef = useRef("");
  const currentParsedRef = useRef<ParsedQuery>({ cleanQuery: "" });

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) return;

    // 날짜 파싱 — 쿼리에서 날짜 표현 추출
    const parsed = parseDateFromQuery(q);
    currentParsedRef.current = parsed;
    setParsedDate({ cleanQuery: parsed.cleanQuery, label: parsed.dateLabel, from: parsed.dateFrom, to: parsed.dateTo });

    setSearched(true);
    currentQueryRef.current = q;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // 초기화
    setWebItems([]); setWebLoading(true); setWebError("");
    setNewsItems([]); setNewsLoading(true); setNewsError(""); setNewsHasMore(false); setNextStart(1);
    setRoadmap(null); setRoadmapLoading(true); setRoadmapError("");

    // 0) 웹 검색 (Google/Serper)
    getWebSearch(parsed.cleanQuery, 10)
      .then((res) => {
        if (currentQueryRef.current !== q) return;
        const seen = new Set<string>();
        setWebItems(res.filter((item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        }));
      })
      .catch(() => { if (currentQueryRef.current === q) setWebError("웹 검색 실패"); })
      .finally(() => { if (currentQueryRef.current === q) setWebLoading(false); });

    // 1) 뉴스 — cleanQuery + dateFrom/dateTo 로 정밀 검색
    getQueryNews(parsed.cleanQuery, 1, parsed.dateFrom, parsed.dateTo)
      .then((res) => {
        if (currentQueryRef.current !== q) return;
        setNewsItems(res.items);
        setNewsHasMore(res.hasMore);
        setNextStart(res.nextStart);
      })
      .catch(() => { if (currentQueryRef.current === q) setNewsError("뉴스 로드 실패"); })
      .finally(() => { if (currentQueryRef.current === q) setNewsLoading(false); });

    // 2) 로드맵 — cleanQuery 사용 (날짜 텍스트 없이)
    getSearchRoadmap(parsed.cleanQuery)
      .then((res) => { if (currentQueryRef.current === q) setRoadmap(res); })
      .catch(() => { if (currentQueryRef.current === q) setRoadmapError("로드맵 생성 실패"); })
      .finally(() => { if (currentQueryRef.current === q) setRoadmapLoading(false); });
  }, []);

  const loadMore = useCallback(() => {
    if (newsLoading || !newsHasMore) return;
    const q = currentQueryRef.current;
    if (!q) return;
    const { cleanQuery, dateFrom, dateTo } = currentParsedRef.current;
    setNewsLoading(true);
    getQueryNews(cleanQuery, nextStart, dateFrom, dateTo)
      .then((res) => {
        if (currentQueryRef.current !== q) return;
        setNewsItems((prev) => {
          const seen = new Set(prev.map((i) => i.url));
          return [...prev, ...res.items.filter((i) => !seen.has(i.url))];
        });
        setNewsHasMore(res.hasMore);
        setNextStart(res.nextStart);
      })
      .catch(() => {})
      .finally(() => { if (currentQueryRef.current === q) setNewsLoading(false); });
  }, [newsLoading, newsHasMore, nextStart]);

  useEffect(() => {
    if (initialQuery) doSearch(initialQuery);
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    router.replace(`/main/search?q=${encodeURIComponent(query.trim())}`);
    doSearch(query.trim());
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSearch(); }
  };

  const bg       = isDark ? "bg-slate-950"                    : "bg-gray-50";
  const headerBg = isDark ? "bg-slate-900 border-white/10"    : "bg-white border-gray-200";
  const inputCls = isDark
    ? "border-white/15 bg-white/8 text-white placeholder-white/30 focus:border-indigo-400"
    : "border-gray-200 bg-gray-50 text-gray-900 focus:border-indigo-400";

  return (
    <div className={`flex h-screen min-h-0 flex-col overflow-hidden ${bg}`}>
      {/* 헤더 */}
      <div className={`shrink-0 border-b px-4 py-3 ${headerBg}`}>
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <button
            onClick={() => router.back()}
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${
              isDark ? "text-white/50 hover:bg-white/10 hover:text-white/80" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            ←
          </button>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색어를 입력하세요"
            className={`min-w-0 flex-1 rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 ${inputCls}`}
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            검색
          </button>
        </div>
      </div>

      {/* AI 답변 패널 — 검색 후에만 표시 */}
      {searched && parsedDate.cleanQuery && (
        <div className="shrink-0 px-4 pt-3 mx-auto w-full max-w-7xl">
          <AiAnswerPanel
            query={parsedDate.cleanQuery}
            dateFrom={parsedDate.from}
            dateTo={parsedDate.to}
            isDark={isDark}
          />
        </div>
      )}

      {/* 3-col 본문 — flex-1 + min-h-0 가 핵심 */}
      <div className="flex min-h-0 flex-1 overflow-hidden px-4 py-4 mx-auto w-full max-w-7xl gap-0">

        {/* LEFT: 웹 검색 결과 (30%) */}
        <div className={`flex w-[30%] shrink-0 flex-col overflow-hidden pr-4 border-r ${
          isDark ? "border-white/8" : "border-gray-200"
        }`}>
          <p className={`mb-2 shrink-0 text-xs font-bold tracking-widest uppercase ${isDark ? "text-white/30" : "text-slate-400"}`}>
            웹 검색
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {webLoading && (
              <div className="space-y-3">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className={`rounded-lg border p-3 space-y-1.5 ${isDark ? "border-white/8" : "border-slate-100"}`}>
                    <div className={`h-3 w-1/3 animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                    <div className={`h-4 w-full animate-pulse rounded ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                    <div className={`h-3 w-5/6 animate-pulse rounded ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
                  </div>
                ))}
              </div>
            )}
            {!webLoading && webError && (
              <p className={`text-xs ${isDark ? "text-red-400" : "text-red-500"}`}>{webError}</p>
            )}
            {!webLoading && !webError && webItems.length === 0 && searched && (
              <p className={`text-xs ${isDark ? "text-white/30" : "text-slate-400"}`}>결과 없음</p>
            )}
            <div className="space-y-2">
              {webItems.map((item, i) => (
                <a key={item.url} href={item.url} target="_blank" rel="noreferrer"
                  className={`block rounded-lg border p-3 transition-colors ${
                    isDark
                      ? "border-white/8 bg-white/2 hover:border-indigo-400/30 hover:bg-white/5"
                      : "border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-2xs font-bold px-1 rounded ${isDark ? "bg-white/10 text-white/40" : "bg-slate-100 text-slate-400"}`}>{i + 1}</span>
                    <span className={`text-2xs truncate ${isDark ? "text-white/30" : "text-slate-400"}`}>{item.source}</span>
                  </div>
                  <p className={`text-xs font-semibold leading-snug line-clamp-2 mb-1 ${isDark ? "text-white/80" : "text-slate-800"}`}>
                    {item.title}
                  </p>
                  {item.snippet && (
                    <p className={`text-2xs leading-relaxed line-clamp-3 ${isDark ? "text-white/40" : "text-slate-500"}`}>
                      {item.snippet}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: 네이버 뉴스 (30%) */}
        <div className={`flex w-[30%] shrink-0 flex-col overflow-hidden px-4 border-r ${
          isDark ? "border-white/8" : "border-gray-200"
        }`}>
          <div className="mb-2 shrink-0 flex items-center gap-2 flex-wrap">
            <p className={`text-xs font-bold tracking-widest uppercase ${isDark ? "text-white/30" : "text-slate-400"}`}>
              뉴스
            </p>
            {parsedDate.label && (
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${
                isDark
                  ? "border-indigo-400/30 bg-indigo-400/10 text-indigo-300"
                  : "border-indigo-200 bg-indigo-50 text-indigo-600"
              }`}>
                <span className="text-2xs">📅</span> {parsedDate.label}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <NewsListPanel
              items={newsItems}
              loading={newsLoading}
              hasMore={newsHasMore}
              loadMore={loadMore}
              error={newsError}
              searched={searched}
              isDark={isDark}
              groupTopics={groupTopics}
              setGroupTopics={setGroupTopics}
            />
          </div>
        </div>

        {/* RIGHT: 로드맵 (나머지) — 내부 가로 스크롤 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-4">
          <RoadmapPanel
            roadmap={roadmap}
            loading={roadmapLoading}
            error={roadmapError}
            searched={searched}
            isDark={isDark}
            query={query}
            onRoadmapUpdate={setRoadmap}
          />
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">
        로딩 중...
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
