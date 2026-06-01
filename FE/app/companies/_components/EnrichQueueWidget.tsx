"use client";

import { useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api/base";
import { useTheme } from "@/contexts/ThemeContext";

interface EnrichQueueStatus {
  pending: number;
  processing: boolean;
  currentCompany: string | null;
  estimatedMs: number | null;
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

  if (!status || (!status.pending && !status.processing)) return null;

  const panelClass = isGlass
    ? "glass-panel border-white/20"
    : isDark
      ? "border-white/10 bg-white/5"
      : "border-slate-200 bg-slate-50";
  const subtleText = isDark ? "text-white/55" : "text-slate-500";
  const eta = formatEta(status.estimatedMs);

  return (
    <div className={`rounded-xl border p-4 transition-all ${panelClass}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold uppercase tracking-widest ${subtleText}`}>공고 수집 큐</p>
        {status.processing && (
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 opacity-80" />
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className={subtleText}>대기</span>
          <span className="font-bold tabular-nums">{status.pending.toLocaleString()}</span>
        </div>

        {status.processing && status.currentCompany && (
          <div className="flex items-start justify-between gap-2 text-xs">
            <span className={`shrink-0 ${subtleText}`}>처리 중</span>
            <span className="truncate text-right font-semibold text-blue-500">{status.currentCompany}</span>
          </div>
        )}

        {eta && (
          <div className="flex items-center justify-between text-xs">
            <span className={subtleText}>예상 완료</span>
            <span className={`font-semibold tabular-nums ${isDark ? "text-white/70" : "text-slate-700"}`}>{eta}</span>
          </div>
        )}
      </div>
    </div>
  );
}
