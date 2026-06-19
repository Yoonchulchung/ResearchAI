"use client";

import { useEffect, useMemo, useState } from "react";
import type { YearlyFinancial } from "@/lib/api/company-analysis";
import {
  getCompanyFinancialInsights,
  getCompanyQuarterlyFinancials,
  getCompanyStock,
  refreshCompanyFinancials,
  type CompanyFinancialInsights,
  type CompanyQuarterlyFinancial,
  type CompanyStockQuote,
} from "@/lib/api/companies";

import {
  deriveFinancialData,
  toAnnualPerformanceData,
  type PerformanceMode,
  type PerformanceRecord,
} from "./financial-utils";
import { PerformanceStatus } from "./PerformanceStatus";
import { FinancialInsightCards } from "./FinancialInsightCards";
import { RiskSignalPanel } from "./RiskSignalPanel";
import { CashFlowChart } from "./CashFlowChart";
import { PeerComparison } from "./PeerComparison";
import { AssetDonutChart } from "./AssetDonutChart";
import { FinancialTable } from "./FinancialTable";
import { FinancialAiAnalysis } from "./FinancialAiAnalysis";

interface FinancialSectionProps {
  companyId: string;
  data: YearlyFinancial[];
  isDark: boolean;
  panelClass: string;
  subtleText: string;
}

export function FinancialSection({
  companyId,
  data: initialData,
  isDark,
  panelClass,
  subtleText,
}: FinancialSectionProps) {
  const [data, setData] = useState<YearlyFinancial[]>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [marketMetrics, setMarketMetrics] =
    useState<CompanyStockQuote["marketMetrics"]>(null);
  const [insights, setInsights] = useState<CompanyFinancialInsights | null>(
    null,
  );
  const [performanceMode, setPerformanceMode] =
    useState<PerformanceMode>("annual");
  const [quarterlyData, setQuarterlyData] = useState<
    CompanyQuarterlyFinancial[]
  >([]);
  const [quarterlyLoaded, setQuarterlyLoaded] = useState(false);
  const [quarterlyLoading, setQuarterlyLoading] = useState(false);
  const [quarterlyError, setQuarterlyError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCompanyStock(companyId, "1d")
      .then((stock) => {
        if (!cancelled) {
          setMarketPrice(
            stock.regularMarketPrice ?? stock.chart.at(-1)?.close ?? null,
          );
          setMarketMetrics(stock.marketMetrics);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarketPrice(null);
          setMarketMetrics(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    getCompanyFinancialInsights(companyId)
      .then((next) => {
        if (!cancelled) setInsights(next);
      })
      .catch(() => {
        if (!cancelled) setInsights(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (performanceMode !== "quarter" || quarterlyLoaded) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25_000);
    setQuarterlyLoading(true);
    setQuarterlyError("");
    getCompanyQuarterlyFinancials(companyId, { signal: controller.signal })
      .then((items) => {
        if (cancelled) return;
        setQuarterlyData(items);
        setQuarterlyLoaded(true);
        if (!items.length)
          setQuarterlyError("표시할 분기 실적 데이터가 없습니다.");
      })
      .catch((e) => {
        if (cancelled) return;
        setQuarterlyLoaded(true);
        setQuarterlyData([]);
        const message =
          e instanceof Error && e.name === "AbortError"
            ? "분기 실적 요청이 25초 이상 지연되어 중단되었습니다. BE가 DART 응답을 기다리는 중일 수 있습니다."
            : e instanceof Error
              ? e.message
              : "분기 실적을 불러오지 못했습니다.";
        setQuarterlyError(message);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setQuarterlyLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [companyId, performanceMode, quarterlyLoaded]);

  const derivedData = useMemo(() => {
    const derived = deriveFinancialData(data, marketPrice);
    const latestYear = derived.at(-1)?.year ?? null;
    if (!marketMetrics || latestYear == null) return derived;
    return derived.map((item) =>
      item.year === latestYear
        ? {
            ...item,
            per: marketMetrics.per ?? item.per,
            pbr: marketMetrics.pbr ?? item.pbr,
            eps: marketMetrics.eps ?? item.eps,
            bps: marketMetrics.bps ?? item.bps,
            dividendYield: marketMetrics.dividendYield ?? item.dividendYield,
            dividend: marketMetrics.dividend ?? item.dividend,
          }
        : item,
    );
  }, [data, marketMetrics, marketPrice]);
  const annualPerformanceData = useMemo(
    () => toAnnualPerformanceData(derivedData),
    [derivedData],
  );
  const quarterlyPerformanceData = useMemo<PerformanceRecord[]>(
    () => quarterlyData.map((d) => ({ ...d })),
    [quarterlyData],
  );

  const performanceData =
    performanceMode === "quarter"
      ? quarterlyPerformanceData
      : annualPerformanceData;
  const performanceError = performanceMode === "quarter" ? quarterlyError : "";
  const performanceLoading =
    performanceMode === "quarter" ? quarterlyLoading : false;
  const performanceHelperText =
    performanceMode === "quarter" && quarterlyLoading
      ? "DART 분기 실적 API를 호출하는 중입니다. 오래 지속되면 DART API 키, BE 응답, 네트워크 상태를 확인해 주세요."
      : "";

  const sorted = [...derivedData].sort((a, b) => b.year - a.year);
  const latest = sorted[0];

  const retryQuarterlyFinancials = () => {
    setQuarterlyLoaded(false);
    setQuarterlyError("");
    setQuarterlyData([]);
    setPerformanceMode("quarter");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      const res = await refreshCompanyFinancials(companyId);
      if (res.financials.length) setData(res.financials);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : "새로고침 실패");
    } finally {
      setRefreshing(false);
    }
  };

  if (!data.length) return null;

  return (
    <div id="company-financials" className="flex scroll-mt-4 flex-col gap-4">
      <PerformanceStatus
        data={performanceData}
        mode={performanceMode}
        loading={performanceLoading}
        error={performanceError}
        helperText={performanceHelperText}
        onModeChange={setPerformanceMode}
        onRetry={retryQuarterlyFinancials}
        isDark={isDark}
        panelClass={panelClass}
        subtleText={subtleText}
      />

      <FinancialInsightCards
        latest={latest}
        isDark={isDark}
        subtleText={subtleText}
      />

      <RiskSignalPanel
        signals={insights?.riskSignals ?? []}
        isDark={isDark}
        panelClass={panelClass}
        subtleText={subtleText}
      />

      <CashFlowChart
        data={derivedData}
        isDark={isDark}
        panelClass={panelClass}
        subtleText={subtleText}
      />

      <PeerComparison
        insights={insights}
        isDark={isDark}
        panelClass={panelClass}
        subtleText={subtleText}
      />

      {latest &&
      (latest.totalAssets || latest.totalEquity || latest.totalLiabilities) ? (
        <AssetDonutChart
          latest={latest}
          isDark={isDark}
          panelClass={panelClass}
          subtleText={subtleText}
        />
      ) : null}

      <FinancialAiAnalysis
        companyId={companyId}
        isDark={isDark}
        panelClass={panelClass}
        subtleText={subtleText}
      />

      <div className={`rounded-md border overflow-hidden ${panelClass}`}>
        <div
          className={`flex items-center justify-between border-b px-4 py-2.5 ${isDark ? "border-white/10" : "border-slate-200"}`}
        >
          <div>
            <h3 className="text-sm font-bold">연간 재무 데이터</h3>
            <p className={`mt-0.5 text-xs ${subtleText}`}>
              DART 공시 기준 (억원)
              {marketMetrics
                ? ` · PER/PBR 등 ${marketMetrics.source}${marketMetrics.asOf ? ` ${marketMetrics.asOf} 기준` : ""}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshError && (
              <p className="text-xs text-red-500">{refreshError}</p>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                refreshing
                  ? "cursor-wait opacity-50"
                  : isDark
                    ? "bg-white/10 text-white/70 hover:bg-white/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {refreshing ? "수집 중..." : "DART 새로고침"}
            </button>
          </div>
        </div>
        <FinancialTable
          data={derivedData}
          isDark={isDark}
          subtleText={subtleText}
        />
      </div>
    </div>
  );
}
