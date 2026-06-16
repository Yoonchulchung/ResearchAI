"use client";

import { useCallback, useEffect, useState } from "react";
import { getCompanyInvestorTrading, type InvestorTradingData, type InvestorTradingRecord } from "@/lib/api/companies";

/* ── 헬퍼 ─────────────────────────────────────────────────── */

function fmtNet(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  if (abs >= 100_000) return `${sign}${(abs / 10_000).toFixed(1)}만`;
  return `${v > 0 ? "+" : ""}${abs.toLocaleString("ko-KR")}`;
}

function netColor(v: number | null, isDark: boolean): string {
  if (v == null) return isDark ? "text-white/40" : "text-slate-400";
  if (v > 0) return "text-red-500";
  if (v < 0) return "text-blue-500";
  return isDark ? "text-white/60" : "text-slate-600";
}

/* ── 요약 바 ───────────────────────────────────────────────── */

function SummaryBar({
  label, value, maxAbs, isDark,
}: { label: string; value: number | null; maxAbs: number; isDark: boolean }) {
  const pct = value != null && maxAbs > 0 ? Math.abs(value) / maxAbs : 0;
  const w   = `${(pct * 50).toFixed(1)}%`;
  const isPos = (value ?? 0) >= 0;

  return (
    <div className="flex items-center gap-3">
      <span className={`w-12 shrink-0 text-sm font-semibold ${isDark ? "text-white/60" : "text-slate-500"}`}>
        {label}
      </span>
      <span className={`w-20 shrink-0 text-right font-mono text-sm font-bold ${netColor(value, isDark)}`}>
        {fmtNet(value)}
      </span>
      {/* 바 (중앙 기준, 양수=오른쪽 빨강, 음수=왼쪽 파랑) */}
      <div className="relative flex h-2 flex-1 items-center">
        <div className={`absolute inset-0 rounded-full ${isDark ? "bg-white/8" : "bg-slate-100"}`} />
        {value != null && value !== 0 && (
          <div
            className={`absolute h-full rounded-full ${isPos ? "left-1/2" : "right-1/2"}`}
            style={{
              width: w,
              background: isPos ? "#ef4444" : "#3b82f6",
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── 테이블 ────────────────────────────────────────────────── */

function TradingTable({ records, isDark, subtleText }: {
  records: InvestorTradingRecord[];
  isDark:  boolean;
  subtleText: string;
}) {
  if (!records.length) return null;
  const borderRow = isDark ? "border-white/8" : "border-slate-100";

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className={`border-b ${borderRow}`}>
            <th className={`py-1.5 pl-1 text-left font-semibold ${subtleText}`}>일자</th>
            <th className={`py-1.5 pr-2 text-right font-semibold ${subtleText}`}>개인</th>
            <th className={`py-1.5 pr-2 text-right font-semibold ${subtleText}`}>외국인</th>
            <th className={`py-1.5 pr-1 text-right font-semibold ${subtleText}`}>기관</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.date} className={`border-b ${borderRow} transition-colors hover:${isDark ? "bg-white/4" : "bg-slate-50"}`}>
              <td className={`py-1.5 pl-1 ${subtleText}`}>
                {r.date.slice(2).replace(/-/g, ".")}
              </td>
              <td className={`py-1.5 pr-2 text-right font-bold ${netColor(r.individual, isDark)}`}>
                {fmtNet(r.individual)}
              </td>
              <td className={`py-1.5 pr-2 text-right font-bold ${netColor(r.foreign, isDark)}`}>
                {fmtNet(r.foreign)}
              </td>
              <td className={`py-1.5 pr-1 text-right font-bold ${netColor(r.institutional, isDark)}`}>
                {fmtNet(r.institutional)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 메인 컴포넌트 ────────────────────────────────────────── */

interface Props {
  companyId:  string;
  isDark:     boolean;
  panelClass: string;
  subtleText: string;
}

export function InvestorTrading({ companyId, isDark, panelClass, subtleText }: Props) {
  const [data,    setData]    = useState<InvestorTradingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const load = useCallback(() => {
    if (loading || fetched) return;
    setLoading(true);
    getCompanyInvestorTrading(companyId, 30)
      .then(setData)
      .catch(() => setData({ stockCode: null, records: [], source: 'KRX', error: '불러오기 실패' }))
      .finally(() => { setLoading(false); setFetched(true); });
  }, [companyId, fetched, loading]);

  useEffect(() => {
    setData(null);
    setFetched(false);
  }, [companyId]);

  useEffect(() => {
    if (!fetched && !loading) load();
  }, [fetched, load, loading]);

  const borderClr = isDark ? "border-white/10" : "border-slate-200";
  const sourceLabel = data?.source === "Naver Finance" ? "네이버 금융 기준 · 외국인/기관 순매수(주)" : "KRX 기준 · 순매수(주)";

  /* 최신 1일 데이터 (요약 바용) */
  const latest  = data?.records[0] ?? null;
  const allVals = data?.records.flatMap((r) => [
    Math.abs(r.individual ?? 0),
    Math.abs(r.foreign    ?? 0),
    Math.abs(r.institutional ?? 0),
  ]) ?? [];
  const maxAbs  = allVals.length ? Math.max(...allVals, 1) : 1;

  return (
    <div className={`rounded-md border overflow-hidden ${panelClass}`}>
      {/* 헤더 */}
      <div className={`flex items-center justify-between border-b px-4 py-2.5 ${borderClr}`}>
        <div>
          <h3 className="text-sm font-bold">투자자별 매매동향</h3>
          <p className={`mt-0.5 text-2xs ${subtleText}`}>{sourceLabel}</p>
        </div>
        {!fetched && (
          <button
            onClick={load}
            disabled={loading}
            className={`rounded px-3 py-1.5 text-xs font-bold transition-colors ${
              isDark
                ? "bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-40"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
            }`}
          >
            {loading ? "로딩 중…" : "데이터 불러오기"}
          </button>
        )}
      </div>

      {loading && (
        <div className={`px-4 py-6 text-center text-sm ${subtleText}`}>KRX에서 데이터 수집 중…</div>
      )}

      {/* 에러 */}
      {fetched && data?.error && !data.records.length && (
        <div className={`px-4 py-4 text-center text-sm ${subtleText}`}>
          {data.error === '종목코드 없음'
            ? '국내 상장 종목이 아닙니다.'
            : `데이터를 가져올 수 없습니다. (${data.error})`}
        </div>
      )}

      {/* 컨텐츠 */}
      {fetched && !!data?.records.length && (
        <>
          {/* 요약 바 (최신일 기준) */}
          {latest && (
            <div className={`border-b px-4 py-3 ${borderClr}`}>
              <p className={`mb-2 text-2xs ${subtleText}`}>{latest.date} 기준</p>
              <div className="flex flex-col gap-2">
                <SummaryBar label="개인"   value={latest.individual}    maxAbs={maxAbs} isDark={isDark} />
                <SummaryBar label="외국인" value={latest.foreign}       maxAbs={maxAbs} isDark={isDark} />
                <SummaryBar label="기관"   value={latest.institutional} maxAbs={maxAbs} isDark={isDark} />
              </div>
            </div>
          )}

          {/* 일별 테이블 */}
          <div className="px-3 py-2">
            <TradingTable records={data.records} isDark={isDark} subtleText={subtleText} />
          </div>

          <div className={`border-t px-4 py-1.5 font-mono text-2xs ${subtleText} ${borderClr}`}>
            {data.source} · {data.records.length}일 데이터
          </div>
        </>
      )}
    </div>
  );
}
