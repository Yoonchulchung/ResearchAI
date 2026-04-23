"use client";

import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api/base";
import { useAuth } from "@/contexts/AuthContext";
import { LoginRequired } from "@/components/LoginRequired";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type AnalyticsRange = "7d" | "30d" | "90d" | "all";
type Granularity = "1h" | "4h" | "1d";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" },
  { value: "all", label: "전체" },
];

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
];

const MODEL_COLORS = [
  "#f97316", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#f59e0b", "#06b6d4", "#84cc16",
];

interface AnalyticsData {
  totalCost: number;
  totalCalls: number;
  chartData: Record<string, string | number>[];
  models: string[];
  byModel: Record<string, { cost: number; calls: number }>;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [granularity, setGranularity] = useState<Granularity>("1d");

  useEffect(() => {
    try {
      const r = localStorage.getItem("analytics:range") as AnalyticsRange;
      const g = localStorage.getItem("analytics:granularity") as Granularity;
      if (r) setRange(r);
      if (g) setGranularity(g);
    } catch {}
  }, []);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/overview/analytics?range=${range}&granularity=${granularity}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [range, granularity]);

  if (!user) return <LoginRequired />;

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setRange(opt.value); try { localStorage.setItem("analytics:range", opt.value); } catch {} }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === opt.value
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setGranularity(opt.value); try { localStorage.setItem("analytics:granularity", opt.value); } catch {} }}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                granularity === opt.value
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
          불러오는 중...
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-48 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-400 mb-1">총 비용</p>
              <p className="text-2xl font-bold text-slate-800">
                ${data.totalCost.toFixed(4)}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-400 mb-1">총 호출 수</p>
              <p className="text-2xl font-bold text-slate-800">
                {data.totalCalls.toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-400 mb-1">사용 모델 수</p>
              <p className="text-2xl font-bold text-slate-800">
                {data.models.length}
              </p>
            </div>
          </div>

          {/* Chart */}
          {data.chartData.length > 0 ? (
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-5">
              <p className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-widest">
                {granularity === "1h" ? "시간별" : granularity === "4h" ? "4시간별" : "일별"} 비용 (USD)
              </p>
              <ResponsiveContainer width="100%" height={220}>
                {granularity !== "1d" ? (
                  <LineChart data={data.chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(value) => [`$${Number(value).toFixed(6)}`, undefined]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.models.map((model, i) => (
                      <Line
                        key={model}
                        type="monotone"
                        dataKey={model}
                        stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                ) : (
                  <BarChart data={data.chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(value) => [`$${Number(value).toFixed(6)}`, undefined]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.models.map((model, i) => (
                      <Bar
                        key={model}
                        dataKey={model}
                        stackId="cost"
                        fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                        radius={i === data.models.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-12 text-center">
              <p className="text-sm text-slate-400">해당 기간의 사용 데이터가 없습니다.</p>
            </div>
          )}

          {/* Per-model breakdown */}
          {data.models.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">모델</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">호출 수</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">비용 (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((model, i) => (
                    <tr key={model} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }}
                        />
                        <span className="text-slate-700 font-medium">{model}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {data.byModel[model]?.calls.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700 font-medium">
                        ${data.byModel[model]?.cost.toFixed(6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
