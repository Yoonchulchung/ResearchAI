"use client";

import type { HrAnalysis, HrWheelArea, UlrichModel, CompetingValues } from "@/lib/api/company-analysis";

// ─── SVG math helpers ─────────────────────────────────────────────────────────

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function polar(cx: number, cy: number, r: number, deg: number) {
  return { x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) };
}
function arcPath(cx: number, cy: number, r1: number, r2: number, s: number, e: number) {
  const lg = e - s > 180 ? 1 : 0;
  const p1 = polar(cx, cy, r1, s), p2 = polar(cx, cy, r1, e);
  const p3 = polar(cx, cy, r2, e), p4 = polar(cx, cy, r2, s);
  return `M${p1.x} ${p1.y} A${r1} ${r1} 0 ${lg} 1 ${p2.x} ${p2.y} L${p3.x} ${p3.y} A${r2} ${r2} 0 ${lg} 0 ${p4.x} ${p4.y}Z`;
}
function secPath(cx: number, cy: number, r: number, s: number, e: number) {
  const lg = e - s > 180 ? 1 : 0;
  const p1 = polar(cx, cy, r, s), p2 = polar(cx, cy, r, e);
  return `M${cx} ${cy} L${p1.x} ${p1.y} A${r} ${r} 0 ${lg} 1 ${p2.x} ${p2.y}Z`;
}

// ─── HR Wheel ─────────────────────────────────────────────────────────────────

const HR_WHEEL_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

type HrWheelCategory = "HRM" | "HRD" | "공통";
const HR_WHEEL_CATEGORY_STYLES: Record<HrWheelCategory, { color: string; label: string; description: string }> = {
  HRM: { color: "#2563eb", label: "HRM", description: "채용·평가·보상 등 인사관리" },
  HRD: { color: "#16a34a", label: "HRD", description: "교육·성장·리더십 등 인재개발" },
  공통: { color: "#f59e0b", label: "공통", description: "문화·몰입처럼 관리와 개발이 겹치는 영역" },
};

function getHrWheelCategory(area: string): HrWheelCategory {
  const n = area.replace(/\s/g, "");
  if (/(교육|성장|개발|육성|학습|역량|리더십|승계|코칭|멘토링)/.test(n)) return "HRD";
  if (/(채용|확보|선발|평가|성과|보상|복리|후생|인사관리|노무|배치|이동|제도|운영)/.test(n)) return "HRM";
  return "공통";
}

function HrWheelLegend({ isDark }: { isDark: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {(Object.entries(HR_WHEEL_CATEGORY_STYLES) as Array<[HrWheelCategory, typeof HR_WHEEL_CATEGORY_STYLES[HrWheelCategory]]>).map(([key, config]) => (
        <span key={key} className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium ${isDark ? "border-slate-700 bg-slate-800/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.color }} />
          <span className="font-bold" style={{ color: config.color }}>{config.label}</span>
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>{config.description}</span>
        </span>
      ))}
    </div>
  );
}

function HrWheelChart({ areas, isDark }: { areas: HrWheelArea[]; isDark: boolean }) {
  const n = areas.length;
  if (n === 0) return null;
  const cx = 220, cy = 220, rInner = 68, rOuter = 152, rLabel = 185, rScore = 111;
  const gap = n > 8 ? 2 : 3;
  return (
    <svg viewBox="0 0 440 460" width="100%" style={{ maxWidth: 520, overflow: "visible" }}>
      {areas.map((area, i) => {
        const segAngle = 360 / n;
        const startDeg = -90 + i * segAngle + gap;
        const endDeg = -90 + (i + 1) * segAngle - gap;
        const midDeg = (startDeg + endDeg) / 2;
        const category = getHrWheelCategory(area.area);
        const categoryStyle = HR_WHEEL_CATEGORY_STYLES[category];
        const color = categoryStyle.color;
        const borderColor = HR_WHEEL_COLORS[i % HR_WHEEL_COLORS.length];
        const fillR = rInner + (rOuter - rInner) * (area.score / 100);
        const lp = polar(cx, cy, rLabel, midDeg);
        const sp = polar(cx, cy, rScore, midDeg);
        const anchor = lp.x < cx - 6 ? "end" : lp.x > cx + 6 ? "start" : "middle";
        return (
          <g key={i}>
            <path d={arcPath(cx, cy, rOuter, rInner, startDeg, endDeg)} fill={isDark ? "#1e293b" : "#e2e8f0"} />
            <path d={arcPath(cx, cy, rOuter, rInner, startDeg, endDeg)} fill="none" stroke={borderColor} strokeWidth={1.25} opacity={0.55} />
            <path d={arcPath(cx, cy, fillR, rInner, startDeg, endDeg)} fill={color} opacity={0.85} />
            <text x={sp.x} y={sp.y} textAnchor="middle" dominantBaseline="middle" fontSize={n > 8 ? 11 : 12} fill={isDark ? "#f1f5f9" : "#1e293b"} fontWeight="700">{area.score}</text>
            <text x={lp.x} y={lp.y - 7} textAnchor={anchor} dominantBaseline="middle" fontSize={n > 8 ? 10 : 11} fill={isDark ? "#cbd5e1" : "#475569"} fontWeight="600">{area.area}</text>
            <text x={lp.x} y={lp.y + 8} textAnchor={anchor} dominantBaseline="middle" fontSize={10} fill={color} fontWeight="800">{categoryStyle.label}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={58} fill="#3b82f6" />
      <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight="bold" fill="white">HR</text>
      <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight="700" fill="#dbeafe">Wheel</text>
    </svg>
  );
}

// ─── Ulrich Model ─────────────────────────────────────────────────────────────

function UlrichModelChart({ model, isDark }: { model: UlrichModel; isDark: boolean }) {
  const cx = 180, cy = 180, r = 142;
  const quads = [
    { key: "strategicPartner" as const, lines: ["전략적", "파트너"], color: "#3b82f6", s: 180, e: 270, ld: 225 },
    { key: "changeAgent" as const, lines: ["변화", "관리자"], color: "#14b8a6", s: 270, e: 360, ld: 315 },
    { key: "adminExpert" as const, lines: ["행정", "전문가"], color: "#f59e0b", s: 90, e: 180, ld: 135 },
    { key: "employeeChampion" as const, lines: ["직원", "후원자"], color: "#22c55e", s: 0, e: 90, ld: 45 },
  ];
  return (
    <svg viewBox="0 0 360 360" width="100%" style={{ maxWidth: 420 }}>
      {quads.map(({ key, lines, color, s, e, ld }) => {
        const score = model[key];
        const fillR = r * (score / 100);
        const lp = polar(cx, cy, r * 0.62, ld);
        const sp = polar(cx, cy, r * 0.34, ld);
        return (
          <g key={key}>
            <path d={secPath(cx, cy, r, s, e)} fill={isDark ? "#1e293b" : "#e2e8f0"} />
            <path d={secPath(cx, cy, fillR, s, e)} fill={color} opacity={0.65} />
            {lines.map((line, li) => (
              <text key={li} x={lp.x} y={lp.y + (li - (lines.length - 1) / 2) * 17} textAnchor="middle" dominantBaseline="middle" fontSize={14} fill={isDark ? "#f1f5f9" : "#1e293b"} fontWeight="700">{line}</text>
            ))}
            <text x={sp.x} y={sp.y} textAnchor="middle" dominantBaseline="middle" fontSize={17} fill={isDark ? "#f1f5f9" : "#1e293b"} fontWeight="bold">{score}</text>
          </g>
        );
      })}
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth={2} />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth={1.5} />
      <text x={cx} y={cy - r - 12} textAnchor="middle" fontSize={12} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>전략적</text>
      <text x={cx} y={cy + r + 20} textAnchor="middle" fontSize={12} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>운영적</text>
      <text x={cx - r - 10} y={cy} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>프로세스</text>
      <text x={cx + r + 10} y={cy} textAnchor="start" dominantBaseline="middle" fontSize={12} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>사람</text>
      <circle cx={cx} cy={cy} r={9} fill={isDark ? "#0f172a" : "#f8fafc"} stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth={1.5} />
    </svg>
  );
}

// ─── CVF Chart ────────────────────────────────────────────────────────────────

function CvfChart({ cvf, isDark }: { cvf: CompetingValues; isDark: boolean }) {
  const W = 430, H = 430, gridX = 38, gridY = 34, gridW = 354, gridH = 354;
  const cw = gridW / 2, ch = gridH / 2, gap = 10;
  const cells = [
    { key: "clan" as const, label: "클랜", sub: "유연·내부집중", color: "#22c55e", row: 0, col: 0, evidenceY: 63 },
    { key: "adhocracy" as const, label: "아드호크라시", sub: "유연·외부집중", color: "#8b5cf6", row: 0, col: 1, evidenceY: 63 },
    { key: "hierarchy" as const, label: "위계", sub: "통제·내부집중", color: "#3b82f6", row: 1, col: 0, evidenceY: 64 },
    { key: "market" as const, label: "시장", sub: "통제·외부집중", color: "#f97316", row: 1, col: 1, evidenceY: 64 },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 540 }}>
      {cells.map(({ key, label, sub, color, row, col, evidenceY }) => {
        const score = cvf[key];
        const isDominant = cvf.dominant === key;
        const evidence = cvf.evidence?.[key];
        const x = gridX + col * cw + gap / 2, y = gridY + row * ch + gap / 2;
        const w = cw - gap, h = ch - gap;
        const contentH = h - 78;
        const fillH = contentH * (score / 100);
        const words = evidence ? evidence.split(/\s+/).filter(Boolean) : [];
        const evidenceLines = evidence
          ? words.reduce<string[]>((lines, word) => {
              const current = lines.at(-1) ?? "";
              if (!current) return [word];
              return (current + " " + word).length > 19
                ? [...lines, word]
                : [...lines.slice(0, -1), `${current} ${word}`];
            }, []).slice(0, 3)
          : [];
        return (
          <g key={key}>
            <rect x={x} y={y} width={w} height={h} rx={4} fill={isDark ? "#1e293b" : "#f1f5f9"} />
            <rect x={x} y={y} width={w} height={h} rx={4} fill="none" stroke={isDominant ? color : (isDark ? "#334155" : "#e2e8f0")} strokeWidth={isDominant ? 2.5 : 1} />
            <rect x={x + 4} y={y + h - 4 - fillH} width={w - 8} height={fillH} rx={2} fill={color} opacity={0.55} />
            <text x={x + w / 2} y={y + 21} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight="bold" fill={isDark ? "#f1f5f9" : "#1e293b"}>{label}</text>
            <text x={x + w / 2} y={y + 40} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>{sub}</text>
            {evidenceLines.map((line, i) => (
              <text key={i} x={x + w / 2} y={y + evidenceY + i * 12} textAnchor="middle" dominantBaseline="middle" fontSize={9.2} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>{line}</text>
            ))}
            <text x={x + w / 2} y={y + h - 14} textAnchor="middle" dominantBaseline="middle" fontSize={18} fontWeight="bold" fill={color}>{score}%</text>
            {isDominant && <text x={x + w / 2} y={y + h - 34} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight="700" fill={color}>▲ 지배적</text>}
          </g>
        );
      })}
      <line x1={gridX + gridW / 2} y1={gridY} x2={gridX + gridW / 2} y2={gridY + gridH} stroke={isDark ? "#334155" : "#dbe3ee"} strokeWidth={1.5} />
      <line x1={gridX} y1={gridY + gridH / 2} x2={gridX + gridW} y2={gridY + gridH / 2} stroke={isDark ? "#334155" : "#dbe3ee"} strokeWidth={1.5} />
      <text x={gridX + gridW / 2} y={16} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight="700" fill={isDark ? "#94a3b8" : "#64748b"}>유연성</text>
      <text x={gridX + gridW / 2} y={H - 17} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight="700" fill={isDark ? "#94a3b8" : "#64748b"}>통제</text>
      <text x={16} y={gridY + gridH / 2} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight="700" fill={isDark ? "#94a3b8" : "#64748b"}>내부</text>
      <text x={W - 16} y={gridY + gridH / 2} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight="700" fill={isDark ? "#94a3b8" : "#64748b"}>외부</text>
    </svg>
  );
}

// ─── HrSection (public export) ────────────────────────────────────────────────

export function HrSection({ hr, isDark }: { hr: HrAnalysis; isDark: boolean }) {
  return (
    <div className="space-y-10">
      {hr.hrWheel && hr.hrWheel.length > 0 && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>HR Wheel — 기능별 강조도</p>
          <div className="flex justify-center px-2 sm:px-6"><HrWheelChart areas={hr.hrWheel} isDark={isDark} /></div>
          <HrWheelLegend isDark={isDark} />
          {hr.hrWheel.some((w) => w.evidence) && (
            <div className="mt-5 space-y-2">
              {hr.hrWheel.filter((w) => w.evidence).map((w) => {
                const category = getHrWheelCategory(w.area);
                const categoryStyle = HR_WHEEL_CATEGORY_STYLES[category];
                return (
                  <p key={w.area} className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    <span className="mr-1.5 font-bold" style={{ color: categoryStyle.color }}>{categoryStyle.label}</span>
                    <span className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{w.area}</span>: {w.evidence}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
      {hr.ulrichModel && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>울리치 모델 (Ulrich HR Model)</p>
          <div className="flex justify-center px-2 sm:px-6"><UlrichModelChart model={hr.ulrichModel} isDark={isDark} /></div>
          {hr.ulrichModel.description && <p className={`text-sm leading-relaxed mt-4 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{hr.ulrichModel.description}</p>}
        </div>
      )}
      {hr.competingValues && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>경쟁 가치 모델 (CVF)</p>
          <div className="flex justify-center px-2 sm:px-6"><CvfChart cvf={hr.competingValues} isDark={isDark} /></div>
          {hr.competingValues.description && <p className={`text-sm leading-relaxed mt-4 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{hr.competingValues.description}</p>}
          {hr.competingValues.evidence && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {(["clan", "adhocracy", "hierarchy", "market"] as const).map((key) => {
                const labels: Record<string, [string, string]> = { clan: ["클랜", "#22c55e"], adhocracy: ["아드호크라시", "#8b5cf6"], hierarchy: ["위계", "#3b82f6"], market: ["시장", "#f97316"] };
                const [label, color] = labels[key];
                const evidence = hr.competingValues?.evidence?.[key];
                if (!evidence) return null;
                return (
                  <div key={key} className={`rounded-sm border px-3 py-2 ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className={`text-xs font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{label} {hr.competingValues?.[key]}%</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{evidence}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {hr.dataCollectionNote && <p className={`text-xs leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>📎 {hr.dataCollectionNote}</p>}
    </div>
  );
}
