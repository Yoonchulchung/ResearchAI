import type { SpecMetric } from "../_lib/spec-analysis";

export function RadarChart({ metrics, isDark }: { metrics: SpecMetric[]; isDark: boolean }) {
  const size = 320;
  const center = size / 2;
  const radius = 105;
  const angleStep = (Math.PI * 2) / metrics.length;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * angleStep;
    const r = radius * value;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r] as const;
  };
  const polygon = metrics.map((metric, index) => point(index, metric.score / 100).join(",")).join(" ");
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative mx-auto h-[260px] sm:h-[360px] w-full max-w-[420px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible">
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={metrics.map((_, index) => point(index, level).join(",")).join(" ")}
            fill="none"
            stroke={isDark ? "rgba(255,255,255,0.12)" : "rgba(148,163,184,0.28)"}
            strokeWidth="1"
          />
        ))}
        {metrics.map((_, index) => {
          const [x, y] = point(index, 1);
          return <line key={index} x1={center} y1={center} x2={x} y2={y} stroke={isDark ? "rgba(255,255,255,0.10)" : "rgba(148,163,184,0.22)"} strokeWidth="1" />;
        })}
        <polygon points={polygon} fill="rgba(59,130,246,0.15)" stroke="rgb(59,130,246)" strokeWidth="2" />
        {metrics.map((metric, index) => {
          const [x, y] = point(index, metric.score / 100);
          const [lx, ly] = point(index, 1.16);
          return (
            <g key={metric.label}>
              <circle cx={x} cy={y} r="4" fill="rgb(59,130,246)" />
              <text
                x={lx}
                y={ly}
                textAnchor={lx < center - 12 ? "end" : lx > center + 12 ? "start" : "middle"}
                dominantBaseline="middle"
                className={`fill-current text-[10px] sm:text-[13px] font-bold ${isDark ? "text-white/60" : "text-slate-500"}`}
              >
                {metric.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={`absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs sm:text-sm font-bold ${isDark ? "text-blue-300" : "text-blue-500"}`}>
        <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-sm bg-blue-500" />
        합격자
      </div>
    </div>
  );
}
