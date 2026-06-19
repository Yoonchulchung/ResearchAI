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
  searchJdNews,
  scrapeJdNewsArticle,
  type JdNewsItem,
} from "@/lib/api/recruit/company-news";
import { getCompanyAnalysis } from "@/lib/api/company-analysis";
import { useAuth } from "@/contexts/AuthContext";
import { PROSE_CLASS } from "@/recruit/_constants";

type SubTab = "analysis" | "news";

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
        (t) => !["IS", "OF", "TO", "OR", "IN", "AT", "AND", "THE", "PoC"].includes(t),
      ),
    ),
  ].slice(0, 4);

  // 한글 기술/산업 명사 추출 (2-5자, 숫자/조사 제외)
  const koTerms = [
    ...new Set(
      (jd.match(/[가-힣]{2,5}(?=\s|,|및|의|을|를|이|가|은|는)/g) ?? []).filter(
        (w) =>
          w.length >= 2 &&
          !["그리고", "하지만", "기반으로", "통해서", "역할을", "업무를"].includes(w),
      ),
    ),
  ].slice(0, 4);

  if (engTerms.length) parts.push(...engTerms);
  else if (jobTitle) parts.push(jobTitle);
  if (koTerms.length) parts.push(...koTerms.slice(0, 2));

  return parts.join(" ") + " 기술 사업 뉴스 동향";
}

// ── JD 뉴스 카드 (Naver 검색 결과 + Puppeteer 스크레이핑) ─────────────────────
interface JdNewsItemState extends JdNewsItem {
  articleText?: string;
  articleLoading?: boolean;
  articleError?: string | null;
}

function JdNewsCard({
  item,
  onScrape,
}: {
  item: JdNewsItemState;
  onScrape: (item: JdNewsItemState) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-slate-100 bg-white overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-start gap-1.5 text-left"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-slate-800 leading-snug">
            {item.title}
          </span>
        </button>
        <div className="shrink-0 flex items-center gap-1 mt-0.5">
          {item.date && (
            <span className="text-[10px] text-slate-400">
              {item.date.slice(0, 10)}
            </span>
          )}
          <button
            onClick={() => onScrape(item)}
            disabled={item.articleLoading}
            title="본문 읽기"
            className="flex items-center gap-0.5 h-6 px-1.5 rounded-sm border border-indigo-200 bg-indigo-50 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
          >
            {item.articleLoading ? (
              <span className="h-2.5 w-2.5 rounded-full border border-indigo-300 border-t-indigo-600 animate-spin" />
            ) : (
              "본문"
            )}
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center h-6 px-1.5 rounded-sm border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            ↗
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 text-xs text-slate-600 leading-relaxed">
          {item.articleError ? (
            <p className="text-red-400">{item.articleError}</p>
          ) : item.articleText ? (
            <p className="whitespace-pre-wrap">{item.articleText}</p>
          ) : item.snippet ? (
            <p className="text-slate-500">{item.snippet}</p>
          ) : (
            <p className="text-slate-400">"본문" 버튼을 눌러 전체 내용을 읽어옵니다.</p>
          )}
          {item.source && (
            <p className="mt-1 text-[10px] text-slate-400">{item.source}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 관련 뉴스 탭 ──────────────────────────────────────────────────────────────
function JdNewsTab({
  target,
}: {
  target: ResumeTarget;
}) {
  const [searchTopic, setSearchTopic] = useState(() =>
    buildSearchTopic(target.jd ?? "", target.companyName, target.jobTitle),
  );
  const [items, setItems] = useState<JdNewsItemState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (userEditedRef.current) return;
    setSearchTopic(
      buildSearchTopic(target.jd ?? "", target.companyName, target.jobTitle),
    );
  }, [target.jd, target.companyName, target.jobTitle]);

  const handleSearch = useCallback(async () => {
    const topic = searchTopic.trim();
    if (!topic) return;
    setLoading(true);
    setError(null);
    setItems([]);
    setSearched(false);
    try {
      const { items: results } = await searchJdNews(topic, 10);
      setItems(results);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [searchTopic]);

  const handleScrape = useCallback(async (item: JdNewsItemState) => {
    setItems((prev) =>
      prev.map((it) =>
        it.url === item.url ? { ...it, articleLoading: true, articleError: null } : it,
      ),
    );
    try {
      const { text } = await scrapeJdNewsArticle(item.url);
      setItems((prev) =>
        prev.map((it) =>
          it.url === item.url
            ? { ...it, articleText: text, articleLoading: false }
            : it,
        ),
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((it) =>
          it.url === item.url
            ? { ...it, articleLoading: false, articleError: e instanceof Error ? e.message : "본문 로드 실패" }
            : it,
        ),
      );
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
        <textarea
          value={searchTopic}
          onChange={(e) => {
            userEditedRef.current = true;
            setSearchTopic(e.target.value);
          }}
          rows={2}
          placeholder="검색어를 입력하세요 (JD에서 자동 추출됨)"
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-indigo-300"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !searchTopic.trim()}
          className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-40"
        >
          {loading ? (
            <>
              <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin shrink-0" />
              검색 중...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {items.length > 0 ? "재검색" : "네이버 뉴스 검색"}
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : items.length === 0 && !loading && searched ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <circle cx="16" cy="14" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M22 20l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M13 14h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-400">검색 결과가 없습니다.</p>
            <p className="text-xs text-slate-300">검색어를 수정해 다시 시도해 보세요.</p>
          </div>
        ) : items.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-200">
              <circle cx="16" cy="14" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M22 20l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M13 14h6M16 11v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-400">
              JD의 조직이 어떤 사업을 하는지,
              <br />
              네이버 뉴스에서 검색합니다.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <JdNewsCard key={item.url} item={item} onScrape={handleScrape} />
            ))}
          </div>
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
          <JdNewsTab target={target} />
        </div>
      )}
    </div>
  );
}
