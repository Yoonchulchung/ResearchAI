"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
}

export interface ChartData {
  type: "line" | "bar" | "pie" | "area";
  title: string;
  series: ChartSeries[];
  unit?: string;
  source?: string;
}

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#8b5cf6", "#14b8a6", "#f97316",
];

function toFlat(series: ChartSeries[]) {
  // 단일 계열: [{ label, value }]
  // 다중 계열: [{ label, [name1]: v1, [name2]: v2 }]
  const labels = series[0]?.data.map((d) => d.label) ?? [];
  return labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    series.forEach((s) => {
      row[s.name] = s.data[i]?.value ?? 0;
    });
    return row;
  });
}

function PieFlat({ series }: { series: ChartSeries[] }) {
  const data = series.flatMap((s) =>
    s.data.map((d) => ({ name: d.label, value: d.value }))
  );
  return (
    <PieChart>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={90}
        label={({ name, percent }) =>
          `${name} ${(percent * 100).toFixed(1)}%`
        }
      >
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
    </PieChart>
  );
}

export function ResearchChart({ chartData }: { chartData: ChartData[] }) {
  if (!chartData?.length) return null;

  return (
    <div className="space-y-6 mb-6">
      {chartData.map((chart, idx) => {
        const flat = toFlat(chart.series);
        const keys = chart.series.map((s) => s.name);
        const unitLabel = chart.unit ? ` (${chart.unit})` : "";

        return (
          <div
            key={idx}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="mb-3 text-sm font-bold text-slate-700">
              {chart.title}
              {chart.unit && (
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {unitLabel}
                </span>
              )}
            </p>

            <ResponsiveContainer width="100%" height={260}>
              {chart.type === "pie" ? (
                <PieFlat series={chart.series} />
              ) : chart.type === "bar" ? (
                <BarChart data={flat} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {keys.length > 1 && <Legend />}
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              ) : chart.type === "area" ? (
                <AreaChart data={flat} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {keys.length > 1 && <Legend />}
                  {keys.map((k, i) => (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={COLORS[i % COLORS.length]}
                      fill={COLORS[i % COLORS.length] + "33"}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              ) : (
                // line (default)
                <LineChart data={flat} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {keys.length > 1 && <Legend />}
                  {keys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>

            {chart.source && (
              <p className="mt-2 text-right text-2xs text-slate-400">
                출처: {chart.source}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
