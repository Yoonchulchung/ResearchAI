"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";

interface AiCallLog {
  id: string;
  aiModel: string;
  caller: string | null;
  systemPrompt: string | null;
  userPrompt: string | null;
  response: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedFees: number;
  durationMs: number;
  error: string | null;
  createdAt: string;
}

interface PageResult {
  data: AiCallLog[];
  total: number;
}

const LIMIT = 20;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchLogs(page: number, model?: string): Promise<PageResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (model) params.set("model", model);
  const res = await fetch(`${API_BASE}/ai/call-logs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch call logs");
  return res.json();
}

async function deleteLogs(): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/call-logs`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete call logs");
}

export function AiCallLogPanel() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [logs, setLogs] = useState<AiCallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modelFilter, setModelFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLogs(page, modelFilter || undefined);
      setLogs(result.data);
      setTotal(result.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, modelFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / LIMIT);

  const handleDelete = async () => {
    if (!confirm("모든 AI 호출 이력을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await deleteLogs();
      setPage(1);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const panelBase = isGlass
    ? isDark
      ? "border border-white/15 bg-white/5 rounded-xl"
      : "border border-black/10 bg-black/5 rounded-xl"
    : "border border-slate-200 bg-white rounded-xl";

  const textPrimary = isDark ? "text-white" : "text-slate-800";
  const textSecondary = isDark ? "text-white/50" : "text-slate-500";
  const textMuted = isDark ? "text-white/30" : "text-slate-400";
  const divider = isDark ? "border-white/10" : "border-slate-100";
  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors ${
    isGlass && isDark
      ? "bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40"
      : isGlass
      ? "bg-black/5 border-black/15 text-slate-800 placeholder:text-slate-400 focus:border-black/30"
      : "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-indigo-400"
  }`;

  const badgeColor = (log: AiCallLog) => {
    if (log.error) return isDark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-600";
    return isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700";
  };

  function fmtMs(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function fmtFee(fee: number) {
    if (fee === 0) return "-";
    if (fee < 0.0001) return `$${(fee * 1000).toFixed(4)}m`;
    return `$${fee.toFixed(4)}`;
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="모델 필터 (예: claude-sonnet)"
          value={modelFilter}
          onChange={(e) => { setModelFilter(e.target.value); setPage(1); }}
          className={`${inputCls} max-w-xs`}
        />
        <button
          onClick={load}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
            isGlass && isDark
              ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
              : isGlass
              ? "border-black/15 bg-black/5 text-slate-700 hover:bg-black/10"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          새로고침
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-2 text-sm rounded-lg border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {deleting ? "삭제 중..." : "전체 삭제"}
        </button>
        <span className={`text-sm ml-auto ${textSecondary}`}>
          총 {total.toLocaleString()}건
        </span>
      </div>

      {/* Table */}
      <div className={`${panelBase} overflow-hidden`}>
        {loading ? (
          <div className={`px-6 py-10 text-center text-sm ${textSecondary}`}>불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className={`px-6 py-10 text-center text-sm ${textSecondary}`}>이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${divider}`}>
                  {["시각", "모델", "Caller", "입력 토큰", "출력 토큰", "비용", "시간", "상태"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left font-medium ${textSecondary} whitespace-nowrap`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className={`border-b ${divider} cursor-pointer hover:${isDark ? "bg-white/5" : "bg-slate-50"} transition-colors`}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className={`px-4 py-3 whitespace-nowrap ${textMuted}`}>{fmtDate(log.createdAt)}</td>
                      <td className={`px-4 py-3 whitespace-nowrap font-mono text-xs ${textPrimary}`}>{log.aiModel}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${textSecondary}`}>{log.caller ?? "-"}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${textSecondary}`}>{log.inputTokens.toLocaleString()}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${textSecondary}`}>{log.outputTokens.toLocaleString()}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${textSecondary}`}>{fmtFee(log.estimatedFees)}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${textSecondary}`}>{fmtMs(log.durationMs)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor(log)}`}>
                          {log.error ? "오류" : "성공"}
                        </span>
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr key={`${log.id}-detail`} className={`border-b ${divider}`}>
                        <td colSpan={8} className="px-4 py-4">
                          <div className="space-y-3">
                            {log.error && (
                              <div>
                                <p className={`text-xs font-medium mb-1 text-red-400`}>오류</p>
                                <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono bg-red-500/10 rounded-lg px-3 py-2">{log.error}</pre>
                              </div>
                            )}
                            {log.systemPrompt && (
                              <div>
                                <p className={`text-xs font-medium mb-1 ${textSecondary}`}>시스템 프롬프트</p>
                                <pre className={`text-xs whitespace-pre-wrap font-mono rounded-lg px-3 py-2 max-h-40 overflow-y-auto ${isDark ? "bg-white/5 text-white/70" : "bg-slate-100 text-slate-700"}`}>{log.systemPrompt}</pre>
                              </div>
                            )}
                            {log.userPrompt && (
                              <div>
                                <p className={`text-xs font-medium mb-1 ${textSecondary}`}>사용자 프롬프트</p>
                                <pre className={`text-xs whitespace-pre-wrap font-mono rounded-lg px-3 py-2 max-h-40 overflow-y-auto ${isDark ? "bg-white/5 text-white/70" : "bg-slate-100 text-slate-700"}`}>{log.userPrompt}</pre>
                              </div>
                            )}
                            {log.response && (
                              <div>
                                <p className={`text-xs font-medium mb-1 ${textSecondary}`}>응답</p>
                                <pre className={`text-xs whitespace-pre-wrap font-mono rounded-lg px-3 py-2 max-h-40 overflow-y-auto ${isDark ? "bg-white/5 text-white/70" : "bg-slate-100 text-slate-700"}`}>{log.response}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-40 ${
              isGlass && isDark
                ? "border-white/20 bg-white/10 text-white"
                : isGlass
                ? "border-black/15 bg-black/5 text-slate-700"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            이전
          </button>
          <span className={`text-sm ${textSecondary}`}>{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-40 ${
              isGlass && isDark
                ? "border-white/20 bg-white/10 text-white"
                : isGlass
                ? "border-black/15 bg-black/5 text-slate-700"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
