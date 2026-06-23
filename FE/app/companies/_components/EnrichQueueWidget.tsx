"use client";

import { useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api/base";
import { useTheme } from "@/contexts/ThemeContext";

interface ApiSourceStat {
  calls: number;
  success: number;
  fail: number;
}

interface EnrichQueueStatus {
  pending: number;
  processing: boolean;
  currentCompany: string | null;
  estimatedMs: number | null;
  sessionProcessed: number;
  sessionTotal: number;
  recentCompanies?: { name: string; doneAt: string }[];
  apiStats?: Record<string, ApiSourceStat>;
}

function formatEta(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `약 ${totalSec}초`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `약 ${min}분 ${sec}초` : `약 ${min}분`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `약 ${hr}시간 ${remMin}분` : `약 ${hr}시간`;
}

export function EnrichQueueWidget() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const [status, setStatus] = useState<EnrichQueueStatus | null>(null);
  // 업데이트 빈도를 줄이기 위해 마지막 렌더 값과 다를 때만 setState
  const lastRef = useRef<string>("");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(WS_BASE);

      ws.onopen = () => {
        ws!.send(JSON.stringify({ event: "subscribe:enrich-queue" }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.event !== "enrich-queue:update") return;
          const next = msg.data as EnrichQueueStatus;
          const key = `${next.pending}|${next.processing}|${next.currentCompany}|${next.estimatedMs}`;
          if (key === lastRef.current) return;
          lastRef.current = key;
          setStatus(next);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!destroyed) reconnectTimer = setTimeout(connect, 4000);
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const hasActivity =
    status &&
    (status.pending > 0 ||
      status.processing ||
      (status.sessionTotal ?? 0) > 0 ||
      (status.recentCompanies?.length ?? 0) > 0);
  if (!hasActivity) return null;

  const panelClass = isGlass
    ? "glass-panel border-white/20"
    : isDark
      ? "border-white/10 bg-white/5"
      : "border-slate-200 bg-slate-50";
  const subtleText = isDark ? "text-white/55" : "text-slate-500";
  const eta = formatEta(status.estimatedMs);

  const { sessionProcessed = 0, sessionTotal = 0 } = status;
  const progressPct = sessionTotal > 0 ? Math.min(100, Math.round((sessionProcessed / sessionTotal) * 100)) : 0;
  const showProgress = sessionTotal > 0;

  const apiEntries = status.apiStats ? Object.entries(status.apiStats) : [];
  const totalCalls = apiEntries.reduce((s, [, v]) => s + v.calls, 0);
  const totalSuccess = apiEntries.reduce((s, [, v]) => s + v.success, 0);
  const totalFail = apiEntries.reduce((s, [, v]) => s + v.fail, 0);

  return (
    <div className={`rounded-md border p-4 transition-all ${panelClass}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>기업 수집 큐</p>
        {status.processing && (
          <span className="inline-flex h-2 w-2 rounded-sm bg-blue-500 opacity-80 animate-pulse" />
        )}
      </div>

      {/* 진행률 프로그레스 바 */}
      {showProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs font-semibold tabular-nums ${isDark ? "text-white/80" : "text-slate-700"}`}>
              {sessionProcessed.toLocaleString()} / {sessionTotal.toLocaleString()}건
            </span>
            <span className={`text-xs font-bold tabular-nums ${progressPct === 100 ? "text-emerald-500" : isDark ? "text-white/70" : "text-slate-600"}`}>
              {progressPct}%
            </span>
          </div>
          <div className={`h-2 rounded-sm overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
            <div
              className={`h-full rounded-sm transition-all duration-500 ${progressPct === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* 현재 분석 중인 기업 */}
      {status.processing && status.currentCompany && (
        <div className={`mt-3 rounded-md px-3 py-2 ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-2xs font-bold uppercase tracking-widest text-blue-500">분석 중</span>
          </div>
          <p className={`text-sm font-bold truncate ${isDark ? "text-white/90" : "text-slate-800"}`}>
            {status.currentCompany}
          </p>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={subtleText}>대기</span>
          <span className="font-bold tabular-nums">{status.pending.toLocaleString()}</span>
        </div>

        {eta && (
          <div className="flex items-center justify-between text-xs">
            <span className={subtleText}>예상 완료</span>
            <span className={`font-semibold tabular-nums ${isDark ? "text-white/70" : "text-slate-700"}`}>{eta}</span>
          </div>
        )}
      </div>

      {/* 최근 완료 기업 목록 */}
      {status.recentCompanies && status.recentCompanies.length > 0 && (
        <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <p className={`text-2xs font-bold uppercase tracking-widest mb-2 ${subtleText}`}>최근 완료</p>
          <div className="space-y-1">
            {status.recentCompanies.slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className={`text-xs truncate ${i === 0 ? (isDark ? "text-white/80" : "text-slate-700") : subtleText}`}>
                  {c.name}
                </span>
                <span className={`text-2xs tabular-nums shrink-0 ${subtleText}`}>
                  {new Date(c.doneAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {apiEntries.length > 0 && (
        <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>API 호출 현황</p>
            <span className={`text-xs tabular-nums font-semibold ${isDark ? "text-white/70" : "text-slate-700"}`}>
              총 {totalCalls.toLocaleString()}건
            </span>
          </div>

          {/* 전체 성공률 바 */}
          {totalCalls > 0 && (
            <div className="mb-3">
              <div className={`h-1.5 rounded-sm overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round((totalSuccess / totalCalls) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-2xs tabular-nums">
                <span className="text-emerald-500">성공 {totalSuccess}</span>
                {totalFail > 0 && <span className="text-rose-400">실패 {totalFail}</span>}
                <span className={subtleText}>{Math.round((totalSuccess / totalCalls) * 100)}%</span>
              </div>
            </div>
          )}

          {/* 소스별 상세 */}
          <div className="space-y-1">
            {apiEntries.map(([source, stat]) => (
              <div key={source} className="flex items-center gap-2">
                <span className={`w-16 shrink-0 text-2xs font-medium truncate ${subtleText}`}>{source}</span>
                <div className={`flex-1 h-1 rounded-sm overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                  <div
                    className={`h-full transition-all ${stat.fail > 0 && stat.success === 0 ? "bg-rose-400" : "bg-indigo-400"}`}
                    style={{ width: stat.calls > 0 ? `${Math.round((stat.success / stat.calls) * 100)}%` : "0%" }}
                  />
                </div>
                <span className={`text-2xs tabular-nums w-10 text-right font-semibold ${isDark ? "text-white/70" : "text-slate-600"}`}>
                  {stat.success}/{stat.calls}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
