"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamWriteAssist } from "@/lib/api/ai";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import type { ResumeTarget } from "@/lib/api/resume";
import {
  getCompanyJdEval,
  upsertCompanyJdEval,
} from "@/lib/api/recruit/company-news";
import { getCompanyAnalysis } from "@/lib/api/company-analysis";
import {
  getQueryNews,
  getSearchRoadmap,
  getWebSearch,
  createSearchAnswerSSE,
  type QueryNewsItem,
  type SearchRoadmapResult,
  type WebSearchItem,
} from "@/lib/api/news-feed";
import { useAuth } from "@/contexts/AuthContext";
import { PROSE_CLASS } from "@/recruit/_constants";

type SubTab = "analysis" | "news" | "jd";

function WrittenJdTab({ target }: { target: ResumeTarget }) {
  const jd = target.jd?.trim();

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            작성한 JD
          </p>
          {(target.companyName || target.jobTitle) && (
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {[target.companyName, target.jobTitle]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {jd ? (
          <div className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-7 text-slate-700">
            {jd}
          </div>
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-400">
              작성한 JD가 없습니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              왼쪽 지원 정보의 JD 영역에 채용공고를 입력하면
              <br />
              이곳에서 바로 확인할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── JD 키워드로 검색 토픽 생성 ────────────────────────────────────────────────
function buildSearchTopic(
  jd: string,
  companyName?: string,
  jobTitle?: string,
): string {
  const parts: string[] = [];
  if (companyName) parts.push(companyName);

  // 영문 대문자 약어 추출 (ADAS, PoC, R&D 등)
  const engTerms = [
    ...new Set(
      (jd.match(/\b[A-Z][A-Z&/]{1,6}\b/g) ?? []).filter(
        (t) =>
          !["IS", "OF", "TO", "OR", "IN", "AT", "AND", "THE", "PoC"].includes(
            t,
          ),
      ),
    ),
  ].slice(0, 4);

  // 한글 기술/산업 명사 추출 (2-5자, 숫자/조사 제외)
  const koTerms = [
    ...new Set(
      (jd.match(/[가-힣]{2,5}(?=\s|,|및|의|을|를|이|가|은|는)/g) ?? []).filter(
        (w) =>
          w.length >= 2 &&
          ![
            "그리고",
            "하지만",
            "기반으로",
            "통해서",
            "역할을",
            "업무를",
          ].includes(w),
      ),
    ),
  ].slice(0, 4);

  if (engTerms.length) parts.push(...engTerms);
  else if (jobTitle) parts.push(jobTitle);
  if (koTerms.length) parts.push(...koTerms.slice(0, 2));

  return parts.join(" ") + " 기술 사업 뉴스 동향";
}

type SearchResultTab = "ai" | "all" | "web" | "news" | "roadmap";

function SearchResultCard({
  title,
  url,
  snippet,
  source,
  date,
  type,
}: {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string | null;
  type: "web" | "news";
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-2xs font-bold ${
            type === "news"
              ? "bg-sky-50 text-sky-600"
              : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {type === "news" ? "뉴스" : "웹"}
        </span>
        <span className="min-w-0 flex-1 truncate text-2xs text-slate-400">
          {source}
        </span>
        {date && (
          <span className="shrink-0 text-2xs text-slate-400">
            {date.slice(0, 10)}
          </span>
        )}
        <span className="text-xs text-slate-300 transition-colors group-hover:text-indigo-500">
          ↗
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-bold leading-5 text-slate-800">
        {title}
      </p>
      {snippet && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
          {snippet}
        </p>
      )}
    </a>
  );
}

function SearchLoadingState() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="rounded-lg border border-slate-100 bg-white p-3"
        >
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200" />
          <div className="mt-1.5 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function uniqueByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 메인 통합 검색과 동일한 웹·뉴스·로드맵 API를 작은 사이드바에 맞게 표현합니다.
function JdNewsTab({
  target,
  onItemsLoaded,
}: {
  target: ResumeTarget;
  onItemsLoaded?: (news: QueryNewsItem[], web: WebSearchItem[]) => void;
}) {
  const [searchTopic, setSearchTopic] = useState(() =>
    buildSearchTopic(target.jd ?? "", target.companyName, target.jobTitle),
  );
  const [webItems, setWebItems] = useState<WebSearchItem[]>([]);
  const [newsItems, setNewsItems] = useState<QueryNewsItem[]>([]);
  const [roadmap, setRoadmap] = useState<SearchRoadmapResult | null>(null);
  const [resultTab, setResultTab] = useState<SearchResultTab>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const userEditedRef = useRef(false);
  const searchRunRef = useRef(0);

  // AI 답변
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (userEditedRef.current) return;
    setSearchTopic(
      buildSearchTopic(target.jd ?? "", target.companyName, target.jobTitle),
    );
  }, [target.jd, target.companyName, target.jobTitle]);

  // 검색 완료 시 AI 답변 SSE 시작
  useEffect(() => {
    if (!searched || !searchTopic.trim()) return;
    esRef.current?.close();
    setAiText("");
    setAiLoading(true);
    const es = createSearchAnswerSSE(searchTopic.trim());
    esRef.current = es;
    let settled = false;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "chunk") setAiText((p) => p + data.text);
      else if (data.type === "done" || data.type === "error") {
        settled = true;
        setAiLoading(false);
        es.close();
      }
    };
    es.onerror = () => {
      if (!settled) setAiLoading(false);
      es.close();
    };
    return () => { es.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, searchTopic]);

  const handleSearch = useCallback(async () => {
    const topic = searchTopic.trim();
    if (!topic) return;
    const runId = ++searchRunRef.current;
    setLoading(true);
    setError(null);
    setWebItems([]);
    setNewsItems([]);
    setRoadmap(null);
    setResultTab("ai");
    setSearched(false);
    try {
      const [webResult, newsResult, roadmapResult] = await Promise.allSettled([
        getWebSearch(topic, 8),
        getQueryNews(topic, 1),
        getSearchRoadmap(topic),
      ]);

      if (searchRunRef.current !== runId) return;
      const newWeb = webResult.status === "fulfilled" ? uniqueByUrl(webResult.value) : [];
      const newNews = newsResult.status === "fulfilled" ? uniqueByUrl(newsResult.value.items).slice(0, 10) : [];
      setWebItems(newWeb);
      setNewsItems(newNews);
      onItemsLoaded?.(newNews, newWeb);
      if (roadmapResult.status === "fulfilled") setRoadmap(roadmapResult.value);
      if (
        webResult.status === "rejected" &&
        newsResult.status === "rejected" &&
        roadmapResult.status === "rejected"
      ) {
        throw new Error("통합 검색 결과를 불러오지 못했습니다.");
      }
      setSearched(true);
    } catch (e) {
      if (searchRunRef.current !== runId) return;
      setError(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.");
    } finally {
      if (searchRunRef.current === runId) setLoading(false);
    }
  }, [searchTopic]);

  const roadmapEvents =
    roadmap?.months
      .flatMap((month) =>
        month.events.map((event) => ({
          ...event,
          yearMonth: month.yearMonth,
        })),
      )
      .slice(0, 12) ?? [];
  const totalResults =
    webItems.length + newsItems.length + roadmapEvents.length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/70">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-indigo-300 focus-within:bg-white">
          <svg
            width="13"
            height="13"
            viewBox="0 0 12 12"
            fill="none"
            className="shrink-0 text-slate-400"
          >
            <circle
              cx="5"
              cy="5"
              r="3.5"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M8 8l2.5 2.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={searchTopic}
            onChange={(event) => {
              userEditedRef.current = true;
              setSearchTopic(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSearch();
            }}
            placeholder="기업·사업·기술 통합 검색"
            className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-700 outline-none"
          />
          <button
            onClick={() => void handleSearch()}
            disabled={loading || !searchTopic.trim()}
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {loading ? "검색 중" : searched ? "재검색" : "검색"}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: "ai", label: "AI 답변", count: 0 },
              { id: "all", label: "전체", count: totalResults },
              { id: "web", label: "사업·웹", count: webItems.length },
              { id: "news", label: "뉴스", count: newsItems.length },
              {
                id: "roadmap",
                label: "사업 흐름",
                count: roadmapEvents.length,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setResultTab(tab.id)}
              className={`shrink-0 rounded-md px-2 py-1 text-2xs font-bold transition-colors ${
                resultTab === tab.id
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {tab.label}
              {searched && <span className="ml-1 opacity-60">{tab.count}</span>}
            </button>
          ))}
          {searched && (
            <a
              href={`/main/search?q=${encodeURIComponent(searchTopic.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 text-2xs font-semibold text-indigo-500 hover:text-indigo-700"
            >
              크게 보기 ↗
            </a>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-500">
            {error}
          </div>
        ) : loading ? (
          <SearchLoadingState />
        ) : !searched ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-500">
              ✦
            </div>
            <p className="mt-3 text-sm font-bold text-slate-600">
              메인 통합 검색을 활용합니다
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              JD에서 추출한 키워드로 웹 사업 정보,
              <br />
              최신 뉴스와 사업 흐름을 함께 찾습니다.
            </p>
          </div>
        ) : (
          <>
            {/* AI 답변 탭 */}
            {resultTab === "ai" && (
              <div className="text-xs leading-relaxed text-slate-700">
                {aiLoading && !aiText && (
                  <div className="space-y-2 py-2">
                    {[90, 70, 80, 60].map((w, i) => (
                      <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {aiText && (
                  <div className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-bold prose-headings:text-slate-700 prose-p:text-xs prose-li:text-xs prose-strong:text-slate-800">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiText}</ReactMarkdown>
                    {aiLoading && (
                      <span className="inline-block h-3 w-0.5 bg-indigo-400 animate-pulse align-middle ml-0.5" />
                    )}
                  </div>
                )}
                {!aiLoading && !aiText && (
                  <p className="py-8 text-center text-slate-400">검색 후 AI 답변이 표시됩니다.</p>
                )}
              </div>
            )}

            {/* 전체 / 웹 / 뉴스 / 사업 흐름 탭 */}
            {resultTab !== "ai" && (
              <div className="space-y-3">
                {totalResults === 0 && (
                  <div className="py-14 text-center text-xs text-slate-400">
                    검색 결과가 없습니다.
                  </div>
                )}

                {(resultTab === "all" || resultTab === "web") && webItems.length > 0 && (
                  <section>
                    <p className="mb-1.5 text-2xs font-black uppercase tracking-wider text-slate-400">
                      사업·웹 검색
                    </p>
                    <div className="space-y-2">
                      {webItems.map((item) => (
                        <SearchResultCard key={`web-${item.url}`} {...item} type="web" />
                      ))}
                    </div>
                  </section>
                )}

                {(resultTab === "all" || resultTab === "news") && newsItems.length > 0 && (
                  <section>
                    <p className="mb-1.5 text-2xs font-black uppercase tracking-wider text-slate-400">
                      관련 뉴스
                    </p>
                    <div className="space-y-2">
                      {newsItems.map((item) => (
                        <SearchResultCard
                          key={`news-${item.url}`}
                          title={item.title}
                          url={item.url}
                          snippet={item.snippet}
                          source={item.source}
                          date={item.publishedAt}
                          type="news"
                        />
                      ))}
                    </div>
                  </section>
                )}

                {(resultTab === "all" || resultTab === "roadmap") && roadmapEvents.length > 0 && (
                  <section>
                    <p className="mb-1.5 text-2xs font-black uppercase tracking-wider text-slate-400">
                      사업 흐름
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white">
                      {roadmapEvents.map((event, index) => (
                        <a
                          key={`${event.yearMonth}-${index}`}
                          href={event.sourceUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block px-3 py-2.5 ${index > 0 ? "border-t border-slate-100" : ""} ${event.sourceUrl ? "hover:bg-indigo-50/40" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-2xs font-bold text-violet-600">
                              {event.yearMonth}
                            </span>
                            <span className="truncate text-2xs text-slate-400">
                              {event.category}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-700">
                            {event.summary}
                          </p>
                        </a>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 메인 JD 평가 패널 ─────────────────────────────────────────────────────────
export function JdEvalPanel({
  target,
  resumeId,
  models,
}: {
  target: ResumeTarget;
  resumeId: string;
  models: { id: string; name: string }[];
}) {
  const { user } = useAuth();
  const defaultModel = user?.defaultCloudModel ?? models[0]?.id ?? "";
  const [model, setModel] = useState(defaultModel);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("analysis");
  const abortRef = useRef<AbortController | null>(null);

  // 뉴스 탭에서 로드된 아이템 — handleRun에서 companyCtx 구성에 사용
  const [latestNewsItems, setLatestNewsItems] = useState<QueryNewsItem[]>([]);
  const [latestWebItems, setLatestWebItems] = useState<WebSearchItem[]>([]);
  const handleNewsLoaded = useCallback(
    (news: QueryNewsItem[], web: WebSearchItem[]) => {
      setLatestNewsItems(news);
      setLatestWebItems(web);
    },
    [],
  );

  // Load existing JD eval from DB
  useEffect(() => {
    if (!resumeId) return;
    getCompanyJdEval(resumeId)
      .then((ev) => {
        if (ev?.result) setResult(ev.result);
      })
      .catch(() => {});
  }, [resumeId]);

  const handleRun = useCallback(async () => {
    if (!target.jd?.trim() && !target.companyName?.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setResult("");

    let companyCtx = "";
    if (target.companyName?.trim()) {
      try {
        const key = target.companyName
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        const analysis = await getCompanyAnalysis(key);
        if (analysis) {
          const parts: string[] = [];
          if (analysis.industry) parts.push(`산업: ${analysis.industry}`);
          if (analysis.summary) parts.push(`기업 요약: ${analysis.summary}`);
          if (analysis.companyProfile?.businessArea)
            parts.push(`사업 영역: ${analysis.companyProfile.businessArea}`);
          if (analysis.missionVision?.mission)
            parts.push(`미션: ${analysis.missionVision.mission}`);
          if (analysis.missionVision?.vision)
            parts.push(`비전: ${analysis.missionVision.vision}`);
          if (analysis.swot) {
            const s = analysis.swot.S?.slice(0, 2).join(", ");
            if (s) parts.push(`강점: ${s}`);
          }
          companyCtx = parts.join("\n");
        }
      } catch {
        /* ignore */
      }
    }

    // 현재 패널에 표시된 최신 뉴스(날짜 포함)를 companyCtx에 추가
    const allNewsForCtx = [
      ...latestNewsItems.map((n) => ({
        title: n.title,
        date: n.publishedAt,
        url: n.url,
      })),
      ...latestWebItems.slice(0, 5).map((w) => ({
        title: w.title,
        date: null as string | null,
        url: w.url,
      })),
    ].slice(0, 12);

    if (allNewsForCtx.length > 0) {
      const newsSection = allNewsForCtx
        .map((n, i) => {
          const datePart = n.date ? ` (${n.date.substring(0, 10)})` : "";
          return `[${i + 1}] ${n.title}${datePart}`;
        })
        .join("\n");
      companyCtx = companyCtx
        ? `${companyCtx}\n\n## 최근 관련 뉴스\n${newsSection}`
        : `## 최근 관련 뉴스\n${newsSection}`;
    }

    const content = [
      target.companyName ? `기업명: ${target.companyName}` : "",
      target.jobTitle ? `직무: ${target.jobTitle}` : "",
      target.jd ? `\n채용공고 JD:\n${target.jd}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      let fullResult = "";
      const { jobId } = await enqueueRecruitAssist(
        "jd_evaluate",
        content,
        model,
        undefined,
        companyCtx,
      );
      await streamWriteAssist(
        jobId,
        (event) => {
          if (ctrl.signal.aborted) return;
          if (event.type === "chunk") {
            setResult((p) => p + event.text);
            fullResult += event.text;
          } else if (event.type === "error")
            setError(event.message || "오류가 발생했습니다.");
        },
        ctrl.signal,
      );
      if (!ctrl.signal.aborted && fullResult) {
        await upsertCompanyJdEval(resumeId, {
          companyName: target.companyName ?? "",
          jdText: target.jd ?? "",
          result: fullResult,
          model,
        });
      }
    } catch (e) {
      if (!ctrl.signal.aborted)
        setError(
          e instanceof Error ? e.message : "JD 분석 중 오류가 발생했습니다.",
        );
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [target, resumeId, model]);

  const hasContent = !!(target.jd?.trim() || target.companyName?.trim());

  return (
    <div className="h-full flex flex-col bg-slate-50/60">
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-3 pb-0 border-b border-slate-100">
        {target.companyName && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm font-bold text-slate-700">
              {target.companyName}
            </span>
            {target.jobTitle && (
              <span className="text-sm text-slate-400">
                · {target.jobTitle}
              </span>
            )}
          </div>
        )}

        {/* 서브탭 */}
        <div className="flex gap-0.5 -mb-px">
          {(
            [
              { id: "analysis", label: "AI 분석" },
              { id: "news", label: "관련 뉴스·사업" },
              { id: "jd", label: "작성한 JD" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                subTab === tab.id
                  ? "text-indigo-600 border-indigo-500"
                  : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI 분석 탭 */}
      {subTab === "analysis" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
              className="flex-1 h-7 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-600 outline-none disabled:opacity-50"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleRun}
              disabled={loading || !hasContent}
              className="shrink-0 flex items-center gap-1 h-7 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
            >
              {loading ? (
                <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle
                    cx="5"
                    cy="5"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M3.5 5h3M5 3.5v3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {result ? "재분석" : "JD 분석 시작"}
            </button>
          </div>
          {!hasContent && (
            <p className="px-4 pt-2 text-xs text-slate-400">
              JD 또는 기업명을 입력하면 분석할 수 있습니다.
            </p>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : !result && !loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  className="text-slate-200"
                >
                  <rect
                    x="4"
                    y="4"
                    width="24"
                    height="24"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M9 11h14M9 16h10M9 21h6"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                <p className="text-sm text-slate-400">
                  산업 분석, 주요 업무, 핵심 키워드를
                  <br />
                  AI로 분석합니다.
                </p>
              </div>
            ) : (
              <div
                className={`${PROSE_CLASS} text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result}
                </ReactMarkdown>
                {loading && (
                  <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-indigo-500 align-middle" />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 관련 뉴스·사업 탭 */}
      {subTab === "news" && (
        <div className="flex-1 min-h-0">
          <JdNewsTab target={target} onItemsLoaded={handleNewsLoaded} />
        </div>
      )}

      {/* 작성한 JD 탭 */}
      {subTab === "jd" && (
        <div className="flex-1 min-h-0">
          <WrittenJdTab target={target} />
        </div>
      )}
    </div>
  );
}
