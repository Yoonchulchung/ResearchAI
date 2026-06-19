"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getNewsTimelineSources,
  type TimelineNewsSourceItem,
  type TimelineNewsSourcesResult,
  type TimelineNewsUsageStatus,
} from "@/lib/api/companies";

type UsageFilter = "all" | "used" | "excluded";

const STATUS_META: Record<
  TimelineNewsUsageStatus,
  { label: string; className: string }
> = {
  used: {
    label: "AI 입력 사용",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  excluded_duplicate: {
    label: "유사 뉴스 중복",
    className: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
  },
  excluded_missing_date: {
    label: "게시일 없음",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  excluded_missing_title: {
    label: "제목 없음",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  excluded_company_name: {
    label: "회사명 불일치",
    className: "bg-slate-500/15 text-slate-500 dark:text-white/55",
  },
  excluded_month_limit: {
    label: "월 20건 초과",
    className: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  },
};

function formatDate(value: string | null) {
  if (!value) return "게시일 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function NewsSourceRow({
  item,
  isDark,
}: {
  item: TimelineNewsSourceItem;
  isDark: boolean;
}) {
  const status = STATUS_META[item.usageStatus];

  return (
    <article
      className={`rounded-md border p-3 ${
        isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-1 font-bold ${status.className}`}>
          {status.label}
        </span>
        <span className={isDark ? "text-white/40" : "text-slate-400"}>
          {formatDate(item.publishedAt)}
        </span>
        {item.source && (
          <span className={isDark ? "text-white/40" : "text-slate-400"}>
            {item.source}
          </span>
        )}
        {item.promptIndex !== null && (
          <span className={isDark ? "text-indigo-300" : "text-indigo-600"}>
            {item.yearMonth} 프롬프트 #{item.promptIndex}
          </span>
        )}
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className={`mt-2 block text-sm font-bold leading-relaxed hover:underline ${
          isDark ? "text-white/90" : "text-slate-800"
        }`}
      >
        {item.title || "(제목 없음)"}
      </a>
      <p className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
        {item.usageReason}
      </p>
      {item.relatedEvents.length > 0 && (
        <div
          className={`mt-3 rounded border px-3 py-2 ${
            isDark ? "border-indigo-400/20 bg-indigo-400/5" : "border-indigo-100 bg-indigo-50"
          }`}
        >
          <p className={`text-xs font-black ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
            생성된 로드맵 이벤트
          </p>
          {item.relatedEvents.map((event, index) => (
            <p
              key={`${event.yearMonth}-${event.category}-${index}`}
              className={`mt-1 text-xs leading-relaxed ${
                isDark ? "text-white/65" : "text-slate-600"
              }`}
            >
              [{event.yearMonth} · {event.category}] {event.summary}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}

export function NewsTimelineSourcesModal({
  companyId,
  companyName,
  isDark,
  onClose,
}: {
  companyId: string;
  companyName: string;
  isDark: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<TimelineNewsSourcesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<UsageFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNewsTimelineSources(companyId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "뉴스 근거를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      if (filter === "used" && item.usageStatus !== "used") return false;
      if (filter === "excluded" && item.usageStatus === "used") return false;
      if (!normalizedQuery) return true;
      return `${item.title} ${item.snippet ?? ""} ${item.source ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [data, filter, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${companyName} 뉴스 로드맵 근거`}
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border shadow-2xl ${
          isDark
            ? "border-white/10 bg-slate-950 text-white"
            : "border-slate-200 bg-slate-50 text-slate-900"
        }`}
      >
        <header className={`shrink-0 border-b p-5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">뉴스 로드맵 분석 근거</h2>
              <p className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                현재 전체 재분석 규칙 기준으로 각 뉴스의 AI 입력 여부를 표시합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className={`rounded-md border px-2.5 py-1.5 text-sm font-bold ${
                isDark
                  ? "border-white/10 text-white/60 hover:bg-white/10"
                  : "border-slate-200 text-slate-500 hover:bg-white"
              }`}
            >
              ×
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["저장 뉴스", data.savedCount],
                ["회사명 조건 통과", data.eligibleCount],
                ["AI 입력 사용", data.usedCount],
                ["제외", data.excludedCount],
              ].map(([label, count]) => (
                <div
                  key={label}
                  className={`rounded-md border px-3 py-2 ${
                    isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{label}</p>
                  <p className="mt-0.5 text-lg font-black">{Number(count).toLocaleString()}건</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="flex gap-1">
              {([
                ["all", "전체"],
                ["used", "사용"],
                ["excluded", "제외"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-3 py-2 text-xs font-bold ${
                    filter === value
                      ? isDark
                        ? "bg-white text-slate-950"
                        : "bg-slate-900 text-white"
                      : isDark
                        ? "bg-white/5 text-white/55 hover:bg-white/10"
                        : "bg-white text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 내용, 언론사 검색"
              className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-xs outline-none ${
                isDark
                  ? "border-white/10 bg-white/5 text-white placeholder:text-white/25"
                  : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400"
              }`}
            />
            <span className={`self-center text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>
              표시 {visibleItems.length.toLocaleString()}건
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading ? (
            <p className={`py-8 text-center text-sm ${isDark ? "text-white/45" : "text-slate-500"}`}>
              뉴스 근거를 분류하는 중...
            </p>
          ) : error ? (
            <p className="rounded-md border border-red-500/30 p-3 text-sm text-red-400">{error}</p>
          ) : visibleItems.length === 0 ? (
            <p className={`py-8 text-center text-sm ${isDark ? "text-white/45" : "text-slate-500"}`}>
              조건에 맞는 뉴스가 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <NewsSourceRow key={item.id} item={item} isDark={isDark} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
