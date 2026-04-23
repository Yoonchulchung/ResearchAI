"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api/base";

interface LogEntry {
  id: string;
  createdAt: string;
  model: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedFees: number;
}

interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT_OPTIONS = [10, 25, 50];

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchLogs = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/overview/logs?page=${page}&limit=${limit}`)
      .then((r) => r.json())
      .then((res) => {
        if (res && typeof res.total === "number") {
          setData(res);
          setLastRefresh(new Date());
        } else {
          setData({ data: [], total: 0, page, limit });
        }
      })
      .catch(() => setData({ data: [], total: 0, page, limit }))
      .finally(() => setLoading(false));
  }, [page, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const formatRefreshTime = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())} GMT+9`;
  };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {data ? `총 ${data.total.toLocaleString()}건` : ""}
        </h2>
        <span className="text-xs text-slate-400">
          Last refresh time: {formatRefreshTime(lastRefresh)}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">TIME (GMT+9)</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">MODEL</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">INPUT TOKENS</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">OUTPUT TOKENS</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">COST (USD)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: limit }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  로그가 없습니다.
                </td>
              </tr>
            ) : (
              data?.data.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">
                    {formatTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs font-mono max-w-[180px] truncate">
                    {log.id}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs font-mono whitespace-nowrap">
                    {log.modelId}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 text-xs">
                    {log.inputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 text-xs">
                    {log.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 text-xs font-medium">
                    ${log.estimatedFees.toFixed(6)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
          >
            ←
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages || 1}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
          >
            →
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>LINES PER PAGE</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 bg-white focus:outline-none"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
