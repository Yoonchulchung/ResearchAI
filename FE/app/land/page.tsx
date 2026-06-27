"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getLandOverview,
  LandComplex,
  LandOverview,
  LandSourceStatus,
} from "@/lib/api/land";

const REGION_PRESETS = [
  "서울특별시 강남구",
  "서울특별시 서초구",
  "서울특별시 송파구",
  "서울특별시 마포구",
  "경기도 성남시",
  "경기도 과천시",
  "부산광역시 해운대구",
];

function formatPrice(value: number | null): string {
  if (!value) return "-";
  const eok = Math.floor(value / 10000);
  const man = value % 10000;
  if (eok > 0 && man > 0) {
    return `${eok}억 ${new Intl.NumberFormat("ko-KR").format(man)}`;
  }
  if (eok > 0) return `${eok}억`;
  return `${new Intl.NumberFormat("ko-KR").format(man)}만`;
}

function formatRange(min: number | null, max: number | null): string {
  if (!min && !max) return "-";
  if (min && max && min !== max) return `${formatPrice(min)} ~ ${formatPrice(max)}`;
  return formatPrice(min ?? max);
}

function statusTone(status: LandSourceStatus): string {
  if (status === "live") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "unsupported") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

function ComplexRow({ item }: { item: LandComplex }) {
  return (
    <a
      href={item.naverUrl}
      target="_blank"
      rel="noreferrer"
      className="grid gap-3 border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 md:grid-cols-[1.3fr_1fr_1fr_0.8fr]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
          {item.complexName}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {item.buildYear ? `${item.buildYear}년` : "준공연도 -"}
          {item.householdCount
            ? ` · ${new Intl.NumberFormat("ko-KR").format(item.householdCount)}세대`
            : ""}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400">매매</p>
        <p className="mt-1 font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
          {formatPrice(item.dealPrice)}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {formatRange(item.minDealPrice, item.maxDealPrice)}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400">전세</p>
        <p className="mt-1 font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
          {formatPrice(item.leasePrice)}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {formatRange(item.minLeasePrice, item.maxLeasePrice)}
        </p>
      </div>
      <div className="flex items-center md:justify-end">
        <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300">
          네이버 보기
        </span>
      </div>
    </a>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 20V8L12 4L20 8V20M8 20V12H16V20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        매물 요약을 표시할 수 없습니다.
      </p>
      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {message}
      </p>
    </div>
  );
}

export default function LandPage() {
  const [query, setQuery] = useState("서울특별시 강남구");
  const [submittedQuery, setSubmittedQuery] = useState("서울특별시 강남구");
  const [data, setData] = useState<LandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    getLandOverview(submittedQuery)
      .then((result) => {
        if (!ignore) setData(result);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "조회 실패");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [submittedQuery]);

  const generatedAt = useMemo(() => {
    if (!data?.generatedAt) return "-";
    return new Date(data.generatedAt).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [data?.generatedAt]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery(query);
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">
                Land Research
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
                부동산 지역 리서치
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                지역을 입력하면 아파트 단지 매매·전세 요약과 네이버 부동산 링크를 함께 보여줍니다.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-11 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-emerald-500 dark:focus:bg-slate-900"
                placeholder="예: 서울특별시 강남구"
              />
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-100"
              >
                조회
              </button>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {REGION_PRESETS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => {
                  setQuery(region);
                  setSubmittedQuery(region);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950"
              >
                {region}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <EmptyState message={error} />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="조회 지역"
                value={loading ? "조회 중" : data?.district ?? "-"}
                hint={`업데이트 ${generatedAt}`}
              />
              <SummaryCard
                label="평균 매매"
                value={loading ? "-" : formatPrice(data?.summary.avgDealPrice ?? null)}
                hint={loading ? "네이버 응답 대기" : "단지 표시 가격 기준"}
              />
              <SummaryCard
                label="평균 전세"
                value={loading ? "-" : formatPrice(data?.summary.avgLeasePrice ?? null)}
                hint={loading ? "네이버 응답 대기" : "단지 표시 가격 기준"}
              />
              <SummaryCard
                label="단지 수"
                value={loading ? "-" : `${data?.summary.complexCount ?? 0}개`}
                hint={data?.cortarNo ? `cortarNo ${data.cortarNo}` : "지역 코드 미등록"}
              />
            </section>

            {data && (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div
                    className={`inline-flex w-fit items-center rounded-lg border px-3 py-2 text-xs font-semibold ${statusTone(data.source.status)}`}
                  >
                    {data.source.status === "live"
                      ? "실시간 수집됨"
                      : data.source.status === "unsupported"
                        ? "링크 제공"
                        : "연결 불가"}
                  </div>
                  <a
                    href={data.naverLandUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950"
                  >
                    네이버 부동산에서 열기
                  </a>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {data.source.message}
                </p>
              </section>
            )}

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    단지 목록
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    매매가가 높은 순으로 정렬됩니다.
                  </p>
                </div>
                {loading && (
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-800">
                    불러오는 중
                  </span>
                )}
              </div>
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                    />
                  ))}
                </div>
              ) : data?.complexes.length ? (
                <div>
                  {data.complexes.map((item) => (
                    <ComplexRow key={`${item.complexNo}-${item.complexName}`} item={item} />
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState message={data?.source.message ?? "데이터가 없습니다."} />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
