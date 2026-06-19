"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompanyListItem, CompanyNewsItem } from "@/lib/api/companies";
import {
  detectCompanyNewsKeywords,
  getCompanyNewsKeywords,
  type CompanyNewsKeyword,
} from "@/lib/api/companies";
import { getModels } from "@/lib/api/research";
import type { NewsItem } from "@/lib/api/news-feed";
import {
  groupNewsByDailyTopic,
  type DailyNewsTopicGroup,
} from "@/news/_lib/news-topic-groups";
import type { ModelDefinition } from "@/types";
import { NewsTimelineChart } from "./NewsTimelineChart";

interface NewsCardProps {
  item: CompanyNewsItem;
  isDark: boolean;
  subtleText: string;
}

const HIDDEN_NEWS_KEYWORDS = ["주가", "매출", "전망"];

function shouldHideNewsItem(item: CompanyNewsItem) {
  const text = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
  return HIDDEN_NEWS_KEYWORDS.some((keyword) =>
    text.includes(keyword.toLowerCase()),
  );
}

function mergeNewsItems(...groups: CompanyNewsItem[][]) {
  const seen = new Set<string>();
  const merged: CompanyNewsItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }
  }
  return merged;
}

function formatNewsDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function NewsCard({ item, isDark, subtleText }: NewsCardProps) {
  const publishedDate = formatNewsDate(item.publishedAt);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={`flex gap-3 rounded border p-3 transition-colors ${
        isDark
          ? "border-white/10 hover:bg-white/5"
          : "border-slate-100 hover:bg-slate-50"
      }`}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={`h-20 w-28 shrink-0 rounded-md border object-cover ${
            isDark
              ? "border-white/10 bg-white/5"
              : "border-slate-100 bg-slate-50"
          }`}
        />
      ) : (
        <div
          className={`flex h-20 w-28 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
            isDark
              ? "border-white/10 bg-white/5 text-white/35"
              : "border-slate-100 bg-slate-50 text-slate-300"
          }`}
        >
          NEWS
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 line-clamp-2 text-sm font-bold leading-relaxed">
            {item.title}
          </p>
          {publishedDate && (
            <span className={`shrink-0 pt-0.5 text-xs ${subtleText}`}>
              {publishedDate}
            </span>
          )}
        </div>
        {item.snippet && (
          <p
            className={`mt-1 line-clamp-2 text-xs leading-relaxed ${subtleText}`}
          >
            {item.snippet}
          </p>
        )}
        <p
          className={`mt-1.5 line-clamp-1 text-xs ${isDark ? "text-indigo-400" : "text-indigo-600"}`}
        >
          {item.url}
        </p>
      </div>
    </a>
  );
}

function CompanyTopicGroupCard({
  group,
  newsByUrl,
  isDark,
  subtleText,
}: {
  group: DailyNewsTopicGroup;
  newsByUrl: Map<string, CompanyNewsItem>;
  isDark: boolean;
  subtleText: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const groupItems = group.items
    .map((item) => newsByUrl.get(item.link))
    .filter((item): item is CompanyNewsItem => Boolean(item));
  const visibleItems = expanded ? groupItems : groupItems.slice(0, 3);

  return (
    <section
      className={`overflow-hidden rounded-md border ${
        isDark
          ? "border-emerald-400/20 bg-emerald-400/[0.04]"
          : "border-emerald-100 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
          isDark ? "hover:bg-white/5" : "hover:bg-emerald-50/60"
        }`}
      >
        <span
          className={`rounded-md px-2 py-1 text-xs font-black ${
            isDark
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {group.keyword}
        </span>
        <span className={`text-xs font-semibold ${subtleText}`}>
          같은 날 {groupItems.length}건
        </span>
        <span
          className={`ml-auto text-2xs transition-transform ${
            expanded ? "rotate-180" : ""
          } ${subtleText}`}
        >
          ▼
        </span>
      </button>
      <div
        className={
          isDark ? "border-t border-white/5" : "border-t border-slate-100"
        }
      >
        {visibleItems.map((item, index) => (
          <a
            key={item.id ?? item.url}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className={`group block px-3 py-2.5 transition-colors ${
              index > 0
                ? isDark
                  ? "border-t border-white/5"
                  : "border-t border-slate-100"
                : ""
            } ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                className={`min-w-0 flex-1 text-xs font-bold leading-relaxed ${
                  isDark
                    ? "text-white/85 group-hover:text-emerald-300"
                    : "text-slate-800 group-hover:text-emerald-700"
                }`}
              >
                {item.title}
              </p>
              <span className={`shrink-0 text-2xs ${subtleText}`}>
                {formatNewsDate(item.publishedAt)}
              </span>
            </div>
            {item.snippet && (
              <p
                className={`mt-1 line-clamp-1 text-2xs leading-relaxed ${subtleText}`}
              >
                {item.snippet}
              </p>
            )}
          </a>
        ))}
        {!expanded && groupItems.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`w-full border-t px-3 py-2 text-xs font-semibold ${
              isDark
                ? "border-white/5 text-white/40 hover:bg-white/5"
                : "border-slate-100 text-slate-400 hover:bg-slate-50"
            }`}
          >
            {groupItems.length - 3}건 더 보기
          </button>
        )}
      </div>
    </section>
  );
}

function NewsSkeleton({ isDark, empty }: { isDark: boolean; empty?: boolean }) {
  const base = isDark ? "bg-slate-800" : "bg-slate-200";
  const rows = [75, 55, 90, 65, 80, 50, 85, 60, 70, 55, 88, 62];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className={`flex flex-col gap-3 ${empty ? "opacity-30 blur-[2px] pointer-events-none select-none" : "animate-pulse"}`}
      >
        {rows.map((w, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-100 bg-white"}`}
          >
            <div
              className={`h-3 rounded mb-2 ${base}`}
              style={{ width: `${w}%` }}
            />
            <div
              className={`h-2.5 rounded mb-1.5 ${base} opacity-60`}
              style={{ width: "95%" }}
            />
            <div
              className={`h-2.5 rounded ${base} opacity-40`}
              style={{ width: "70%" }}
            />
          </div>
        ))}
      </div>
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p
            className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            데이터가 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}

interface NewsTabProps {
  company: CompanyListItem;
  news: CompanyNewsItem[];
  newsLoading: boolean;
  newsFetched: boolean;
  newsHasMore: boolean;
  savedNews: CompanyNewsItem[];
  savedNewsLoaded: boolean;
  handleFetchNews: () => void;
  handleFetchMoreNews: () => void;
  loadSavedNews: (id: string) => void;
  companyId: string;
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

export function NewsTab({
  company,
  news,
  newsLoading,
  newsFetched,
  newsHasMore,
  savedNews,
  savedNewsLoaded,
  handleFetchNews,
  handleFetchMoreNews,
  loadSavedNews,
  companyId,
  isDark,
  panelClass,
  subtleText,
}: NewsTabProps) {
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [keywords, setKeywords] = useState<CompanyNewsKeyword[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordError, setKeywordError] = useState("");
  const [groupTopics, setGroupTopics] = useState(true);
  const visibleNews = useMemo(
    () =>
      mergeNewsItems(savedNews, news).filter(
        (item) => !shouldHideNewsItem(item),
      ),
    [news, savedNews],
  );
  const newsTitles = useMemo(
    () => visibleNews.map((item) => item.title).filter(Boolean),
    [visibleNews],
  );
  const hasAnyNews = visibleNews.length > 0;
  const newsByUrl = useMemo(
    () => new Map(visibleNews.map((item) => [item.url, item])),
    [visibleNews],
  );
  const topicGroups = useMemo(() => {
    const topicItems: NewsItem[] = visibleNews.map((item) => ({
      title: item.title,
      link: item.url,
      source: "",
      pubDate: item.publishedAt ?? item.fetchedAt ?? "",
      description: item.snippet,
    }));
    return groupNewsByDailyTopic(topicItems, {
      ignoredKeywords: [company.name, company.normalizedName],
    });
  }, [company.name, company.normalizedName, visibleNews]);
  const groupedTopicCount = topicGroups.filter(
    (group) => group.keyword !== null,
  ).length;

  useEffect(() => {
    let cancelled = false;
    setKeywords([]);
    setKeywordError("");
    getCompanyNewsKeywords(companyId)
      .then((result) => {
        if (!cancelled) setKeywords(result.keywords ?? []);
      })
      .catch(() => {
        if (!cancelled) setKeywords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    getModels()
      .then((items) => {
        if (cancelled) return;
        const cloudModels = items.filter(
          (item) => item.provider !== "ollama" && item.provider !== "llama-cpp",
        );
        const nextModels = cloudModels.length ? cloudModels : items;
        const haikuModel = nextModels.find((item) =>
          item.id.toLowerCase().includes("haiku"),
        );
        setModels(nextModels);
        setSelectedModel(
          (current) => current || haikuModel?.id || nextModels[0]?.id || "",
        );
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDetectKeywords = async () => {
    if (!selectedModel || newsTitles.length === 0 || keywordLoading) return;
    setKeywordLoading(true);
    setKeywordError("");
    try {
      const result = await detectCompanyNewsKeywords(
        companyId,
        selectedModel,
        newsTitles,
      );
      setKeywords(result.keywords);
    } catch (e) {
      setKeywordError(
        e instanceof Error ? e.message : "키워드를 추출하지 못했습니다.",
      );
    } finally {
      setKeywordLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:h-full">
      {/* 왼쪽: 사업 로드맵 타임라인 — NewsTimelineChart가 내부 스크롤 처리 */}
      <div className="w-full xl:flex-1 xl:min-w-0 xl:h-full">
        <NewsTimelineChart
          companyId={companyId}
          companyName={company.name}
          isDark={isDark}
          panelClass={panelClass}
          subtleText={subtleText}
          onBulkComplete={() => loadSavedNews(companyId)}
        />
      </div>

      {/* 오른쪽: 뉴스 기사 목록 — 독립 스크롤 */}
      <div className="flex w-full shrink-0 flex-col gap-4 xl:w-110 2xl:w-130 xl:max-w-[42%] xl:h-full xl:overflow-y-auto custom-scrollbar xl:pr-2">
        <div className={`rounded-md border p-4 ${panelClass}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black">뉴스</h2>
              <p className={`mt-0.5 text-xs ${subtleText}`}>
                {savedNewsLoaded
                  ? `표시 중 ${visibleNews.length}건`
                  : "저장된 뉴스를 불러오는 중..."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadSavedNews(companyId)}
                className={`rounded px-2.5 py-1 text-xs font-bold transition-colors ${
                  isDark
                    ? "text-white/50 hover:text-white/80"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                새로고침
              </button>
              <button
                onClick={hasAnyNews ? handleFetchMoreNews : handleFetchNews}
                disabled={newsLoading}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  newsLoading
                    ? "cursor-wait bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-white/30"
                    : isDark
                      ? "bg-white text-slate-950 hover:bg-white/90"
                      : "bg-slate-950 text-white hover:bg-slate-800"
                }`}
              >
                {newsLoading
                  ? "수집 중..."
                  : hasAnyNews
                    ? "더 수집"
                    : newsFetched
                      ? "다시 수집"
                      : "뉴스 수집"}
              </button>
            </div>
          </div>

          {hasAnyNews ? (
            <div
              className={`mb-3 rounded-md border p-3 ${
                isDark
                  ? "border-white/10 bg-white/5"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className={`h-8 min-w-44 rounded border px-2 text-xs font-semibold outline-none ${
                    isDark
                      ? "border-white/10 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {models.length === 0 ? (
                    <option value="">모델 없음</option>
                  ) : (
                    models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  onClick={handleDetectKeywords}
                  disabled={
                    keywordLoading || !selectedModel || newsTitles.length === 0
                  }
                  className={`h-8 rounded-md px-3 text-xs font-bold transition-colors ${
                    keywordLoading || !selectedModel || newsTitles.length === 0
                      ? "cursor-wait bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-white/30"
                      : isDark
                        ? "bg-white text-slate-950 hover:bg-white/90"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {keywordLoading ? "검출 중..." : "AI 키워드 검출"}
                </button>
                <span className={`text-xs ${subtleText}`}>
                  제목 {newsTitles.length}개 기준
                </span>
              </div>
              {keywordError ? (
                <p className="mt-2 text-xs font-semibold text-red-500">
                  {keywordError}
                </p>
              ) : null}
              {keywords.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {keywords.map((item) => (
                    <span
                      key={item.keyword}
                      title={item.reason}
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        isDark
                          ? "border-indigo-300/20 bg-indigo-300/10 text-indigo-100"
                          : "border-indigo-100 bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {item.keyword}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {hasAnyNews ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className={`text-xs ${subtleText}`}>
                {groupTopics && groupedTopicCount > 0
                  ? `${groupedTopicCount}개 주제로 묶음`
                  : "기사별 표시"}
              </span>
              <label
                className={`flex cursor-pointer items-center gap-2 text-xs font-bold ${subtleText}`}
              >
                <input
                  type="checkbox"
                  checked={groupTopics}
                  onChange={(event) => setGroupTopics(event.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                동일 주제 묶기
              </label>
            </div>
          ) : null}

          {!savedNewsLoaded || (!hasAnyNews && !newsLoading) ? (
            <div
              className="relative"
              style={{ minHeight: "max(384px, calc(100vh - 280px))" }}
            >
              <NewsSkeleton
                isDark={isDark}
                empty={savedNewsLoaded && !hasAnyNews}
              />
            </div>
          ) : !hasAnyNews && newsLoading ? (
            <div className="min-h-8" />
          ) : groupTopics ? (
            <div className="space-y-4">
              {[...new Set(topicGroups.map((group) => group.dateKey))].map(
                (day) => {
                  const dayGroups = topicGroups.filter(
                    (group) => group.dateKey === day,
                  );
                  return (
                    <section key={day}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`text-xs font-black ${subtleText}`}>
                          {day}
                        </span>
                        <div
                          className={`h-px flex-1 ${
                            isDark ? "bg-white/10" : "bg-slate-200"
                          }`}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        {dayGroups.map((group) => {
                          const item = newsByUrl.get(group.items[0].link);
                          if (!item) return null;
                          return group.keyword ? (
                            <CompanyTopicGroupCard
                              key={group.id}
                              group={group}
                              newsByUrl={newsByUrl}
                              isDark={isDark}
                              subtleText={subtleText}
                            />
                          ) : (
                            <NewsCard
                              key={group.id}
                              item={item}
                              isDark={isDark}
                              subtleText={subtleText}
                            />
                          );
                        })}
                      </div>
                    </section>
                  );
                },
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleNews.map((item, i) => (
                <NewsCard
                  key={item.id ?? item.url ?? i}
                  item={item}
                  isDark={isDark}
                  subtleText={subtleText}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-h-1">
          {hasAnyNews ? (
            <p className={`py-2 text-center text-xs ${subtleText}`}>
              {newsLoading
                ? "마지막 수집 이후의 최신 뉴스를 찾는 중..."
                : newsHasMore
                  ? "더 수집은 저장된 최신 기사 이후부터 현재까지의 새 뉴스를 수집합니다."
                  : "새로 추가할 뉴스가 없습니다."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
