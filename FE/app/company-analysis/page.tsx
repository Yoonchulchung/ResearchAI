"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import { useModels } from "@/sessions/new/hooks/useModels";
import { DEFAULT_FREE_MODEL_ID } from "@/sessions/new/hooks/useNewSession";
import {
  listCompanyAnalyses,
  getCompanyAnalysis,
  deleteCompanyAnalysis,
  analyzeCompanyStream,
  streamCompanyAnalysisJob,
  type CompanyAnalysis,
  type AnalyzeProgressEvent,
  type CompetencyScores,
  type CompetencyReasons,
  type SwotAnalysis,
  type YearlyFinancial,
  type HrAnalysis,
  type HrWheelArea,
  type CompetingValues,
  type UlrichModel,
} from "@/lib/api/company-analysis";
import { getQueueStatus } from "@/lib/api/queue";
import { API_BASE, readSSE, tokenStore } from "@/lib/api/base";
import { buildZippoomApartmentUrl } from "@/lib/real-estate-url";

const COMPETENCY_LABELS: Array<{ key: keyof CompetencyScores; label: string }> = [
  { key: "성취지향", label: "성취지향" },
  { key: "도전정신", label: "도전정신" },
  { key: "주도성", label: "주도성" },
  { key: "문제해결", label: "문제해결" },
  { key: "의사소통", label: "의사소통" },
  { key: "대인관계", label: "대인관계" },
  { key: "열정", label: "열정" },
  { key: "주인의식", label: "주인의식" },
  { key: "팀워크", label: "팀워크" },
  { key: "자원계획관리", label: "자원 계획·관리" },
  { key: "치밀성", label: "치밀성" },
  { key: "분석적사고", label: "분석적 사고" },
  { key: "전문성", label: "전문성" },
];

const CORP_CLASS_LABEL: Record<string, string> = {
  Y: "유가증권(KOSPI)",
  K: "코스닥(KOSDAQ)",
  N: "코넥스",
  E: "비상장",
};

function estimateAnalysisProgress(event: AnalyzeProgressEvent, current: number) {
  if (event.type === "done") return 100;
  if (event.type === "error") return current;
  if (event.type === "searching") return Math.max(current, 10);
  if (event.type === "scoring") return Math.max(current, 74);
  if (event.type !== "log") return current;

  const message = event.message;
  const checkpoints: Array<[RegExp, number]> = [
    [/인재상|채용 정보 검색/, 8],
    [/최근 뉴스/, 15],
    [/사업부문/, 22],
    [/직무소개/, 30],
    [/채용 공고/, 36],
    [/경쟁사 후보/, 40],
    [/기술 조직|HRD 신호/, 43],
    [/DART|재무 데이터/, 48],
    [/공식 웹사이트/, 52],
    [/잡플래닛/, 60],
    [/아파트 시세|시세 조회/, 68],
    [/AI 분석 시작/, 82],
    [/결과 저장/, 96],
  ];
  const checkpoint = checkpoints.find(([pattern]) => pattern.test(message));
  if (checkpoint) return Math.max(current, checkpoint[1]);
  return Math.min(96, Math.max(current + 2, current));
}

type AnalysisRunStatus = "pending" | "running" | "done" | "error";

interface AnalysisRunProgress {
  key: string;
  name: string;
  progress: number;
  status: AnalysisRunStatus;
  currentStep: string;
  lastMessage?: string;
  updatedAt: number;
}

const ANALYSIS_DETAIL_STEPS: Array<{ label: string; threshold: number }> = [
  { label: "요청", threshold: 2 },
  { label: "채용·인재상", threshold: 8 },
  { label: "뉴스", threshold: 15 },
  { label: "사업부문", threshold: 22 },
  { label: "직무", threshold: 30 },
  { label: "채용공고", threshold: 36 },
  { label: "경쟁사", threshold: 40 },
  { label: "기술·HRD", threshold: 43 },
  { label: "DART", threshold: 48 },
  { label: "리뷰·시세", threshold: 68 },
  { label: "AI 분석", threshold: 82 },
  { label: "저장", threshold: 96 },
  { label: "완료", threshold: 100 },
];

function getAnalysisStepLabel(event: AnalyzeProgressEvent, fallback: string) {
  if (event.type === "done") return "완료";
  if (event.type === "error") return "오류";
  if (event.type === "searching") return "외부 데이터 수집";
  if (event.type === "scoring") return "AI 병렬 분석";
  if (event.type !== "log" || !event.message) return fallback;

  const message = event.message;
  const rules: Array<[RegExp, string]> = [
    [/인재상|채용 정보 검색/, "인재상·채용 자료 검색"],
    [/최근 뉴스/, "최근 뉴스 수집"],
    [/사업부문/, "사업부문 자료 수집"],
    [/직무소개/, "직무소개 수집"],
    [/채용 공고/, "채용 공고 수집"],
    [/경쟁사 후보/, "경쟁사 후보 크롤링"],
    [/공식 웹사이트/, "공식 웹사이트 확인"],
    [/기술 조직|HRD 신호/, "기술 조직·HRD 자료 수집"],
    [/DART|재무 데이터/, "DART 재무·공시 수집"],
    [/잡플래닛/, "기업 리뷰 수집"],
    [/아파트 시세|시세 조회/, "인근 시세 조회"],
    [/AI 분석 시작/, "AI 병렬 분석"],
    [/결과 저장/, "분석 결과 저장"],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1] ?? fallback;
}

function formatApartmentPrice(price: number | null | undefined) {
  if (!price) return null;
  const eok = price / 10000;
  return `${Number.isInteger(eok) ? eok.toFixed(0) : eok.toFixed(1)}억`;
}

function formatApartmentPriceSummary(prices: CompanyAnalysis["apartmentPrices"]) {
  if (!prices) return null;
  const parts = [
    formatApartmentPrice(prices.avgDealPrice) ? `매매: ${formatApartmentPrice(prices.avgDealPrice)}` : null,
    formatApartmentPrice(prices.avgLeasePrice) ? `전세: ${formatApartmentPrice(prices.avgLeasePrice)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function cleanNewsTitle(title: string) {
  return title
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isDisplayableNewsTitle(title: string, url: string) {
  const cleaned = cleanNewsTitle(title);
  if (cleaned.length < 8) return false;
  if (/^\[[^\]]*$/.test(cleaned)) return false;
  if (/[�Ãìíêëûü]{2,}/.test(cleaned)) return false;
  if (/namu\.wiki|나무위키/i.test(`${cleaned} ${url}`)) return false;
  return true;
}

function normalizeCompanyKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function SectionHeader({ title, badge, isDark }: { title: string; badge?: string; isDark: boolean }) {
  return (
    <div className={`border-b pb-3 mb-4 flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-800"}`}>{title}</h3>
      {badge && (
        <span className="text-[10px] font-mono text-slate-500 border px-1 border-slate-500">{badge}</span>
      )}
    </div>
  );
}

function InfoItem({ label, children, isDark }: { label: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-widest mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      <div className={`text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>{children}</div>
    </div>
  );
}

function Chip({ label, isDark, color = "default" }: { label: string; isDark: boolean; color?: "default" | "blue" | "green" }) {
  const colors = {
    default: isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-700",
    blue: isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-700",
    green: isDark ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-sm text-xs font-medium border ${colors[color]} ${isDark ? "border-slate-600" : "border-slate-200"}`}>
      {label}
    </span>
  );
}

function SwotGrid({ swot, isDark }: { swot: SwotAnalysis; isDark: boolean }) {
  const quadrants = [
    { key: "S" as const, label: "Strengths 강점", bg: isDark ? "bg-emerald-900/20 border-emerald-700/40" : "bg-emerald-50 border-emerald-200", header: isDark ? "text-emerald-400" : "text-emerald-700" },
    { key: "W" as const, label: "Weaknesses 약점", bg: isDark ? "bg-red-900/20 border-red-700/40" : "bg-red-50 border-red-200", header: isDark ? "text-red-400" : "text-red-700" },
    { key: "O" as const, label: "Opportunities 기회", bg: isDark ? "bg-blue-900/20 border-blue-700/40" : "bg-blue-50 border-blue-200", header: isDark ? "text-blue-400" : "text-blue-700" },
    { key: "T" as const, label: "Threats 위협", bg: isDark ? "bg-amber-900/20 border-amber-700/40" : "bg-amber-50 border-amber-200", header: isDark ? "text-amber-400" : "text-amber-700" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {quadrants.map(({ key, label, bg, header }) => (
        <div key={key} className={`rounded-sm border p-4 ${bg}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${header}`}>{label}</p>
          <ul className="space-y-1.5">
            {(swot[key] ?? []).map((item, i) => (
              <li key={i} className={`flex gap-2 text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                <span className={`shrink-0 font-mono ${header}`}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── SVG helpers ──────────────────────────────────────────────────────────────
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
  const normalized = area.replace(/\s/g, "");
  if (/(교육|성장|개발|육성|학습|역량|리더십|승계|코칭|멘토링)/.test(normalized)) return "HRD";
  if (/(채용|확보|선발|평가|성과|보상|복리|후생|인사관리|노무|배치|이동|제도|운영)/.test(normalized)) return "HRM";
  return "공통";
}

function HrWheelLegend({ isDark }: { isDark: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {(Object.entries(HR_WHEEL_CATEGORY_STYLES) as Array<[HrWheelCategory, typeof HR_WHEEL_CATEGORY_STYLES[HrWheelCategory]]>).map(([key, config]) => (
        <span
          key={key}
          className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium ${isDark ? "border-slate-700 bg-slate-800/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
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
  const cx = 220, cy = 220;
  const rInner = 68, rOuter = 152, rLabel = 185, rScore = 111;
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
            <text x={sp.x} y={sp.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={n > 8 ? 11 : 12} fill={isDark ? "#f1f5f9" : "#1e293b"} fontWeight="700">
              {area.score}
            </text>
            <text x={lp.x} y={lp.y - 7} textAnchor={anchor} dominantBaseline="middle"
              fontSize={n > 8 ? 10 : 11} fill={isDark ? "#cbd5e1" : "#475569"} fontWeight="600">
              {area.area}
            </text>
            <text x={lp.x} y={lp.y + 8} textAnchor={anchor} dominantBaseline="middle"
              fontSize={10} fill={color} fontWeight="800">
              {categoryStyle.label}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={58} fill="#3b82f6" />
      <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="middle"
        fontSize={24} fontWeight="bold" fill="white">HR</text>
      <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
        fontSize={11} fontWeight="700" fill="#dbeafe">Wheel</text>
    </svg>
  );
}

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
              <text key={li} x={lp.x} y={lp.y + (li - (lines.length - 1) / 2) * 17}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={14} fill={isDark ? "#f1f5f9" : "#1e293b"} fontWeight="700">
                {line}
              </text>
            ))}
            <text x={sp.x} y={sp.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={17} fill={isDark ? "#f1f5f9" : "#1e293b"} fontWeight="bold">
              {score}
            </text>
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

function CvfChart({ cvf, isDark }: { cvf: CompetingValues; isDark: boolean }) {
  const W = 430, H = 430;
  const gridX = 38, gridY = 34;
  const gridW = 354, gridH = 354;
  const cw = gridW / 2, ch = gridH / 2;
  const gap = 10;
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
        const x = gridX + col * cw + gap / 2;
        const y = gridY + row * ch + gap / 2;
        const w = cw - gap;
        const h = ch - gap;
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
            <rect x={x} y={y} width={w} height={h} rx={4}
              fill={isDark ? "#1e293b" : "#f1f5f9"} />
            <rect x={x} y={y} width={w} height={h} rx={4}
              fill="none" stroke={isDominant ? color : (isDark ? "#334155" : "#e2e8f0")} strokeWidth={isDominant ? 2.5 : 1} />
            <rect x={x + 4} y={y + h - 4 - fillH} width={w - 8} height={fillH} rx={2}
              fill={color} opacity={0.55} />
            <text x={x + w / 2} y={y + 21} textAnchor="middle" dominantBaseline="middle"
              fontSize={16} fontWeight="bold" fill={isDark ? "#f1f5f9" : "#1e293b"}>{label}</text>
            <text x={x + w / 2} y={y + 40} textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fontWeight="600" fill={isDark ? "#94a3b8" : "#64748b"}>{sub}</text>
            {evidenceLines.map((line, i) => (
              <text
                key={i}
                x={x + w / 2}
                y={y + evidenceY + i * 12}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9.2}
                fontWeight="600"
                fill={isDark ? "#94a3b8" : "#64748b"}
              >
                {line}
              </text>
            ))}
            <text x={x + w / 2} y={y + h - 14} textAnchor="middle" dominantBaseline="middle"
              fontSize={18} fontWeight="bold" fill={color}>{score}%</text>
            {isDominant && (
              <text x={x + w / 2} y={y + h - 34} textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight="700" fill={color}>▲ 지배적</text>
            )}
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

// ─── 신뢰도 평가 ──────────────────────────────────────────────────────────────

interface ReliabilityCheck {
  label: string;
  ok: boolean;
  category: "official" | "web" | "ai";
}

function computeReliability(a: CompanyAnalysis): { score: number; checks: ReliabilityCheck[]; categoryScores: Record<string, number> } {
  const checks: ReliabilityCheck[] = [
    // 공식 데이터
    { label: "DART 연결", ok: !!a.dartUrl, category: "official" },
    { label: "다년간 재무", ok: (a.multiYearFinancials?.length ?? 0) >= 2, category: "official" },
    { label: "공시 자료", ok: (a.disclosures?.length ?? 0) > 0, category: "official" },
    { label: "직원 정보", ok: !!(a.employees || a.employeeHistory?.length), category: "official" },
    // 웹 데이터
    { label: "최근 뉴스 5+", ok: (a.recentNews?.length ?? 0) >= 5, category: "web" },
    { label: "채용 공고", ok: (a.jobPostings?.length ?? 0) > 0, category: "web" },
    { label: "기업 리뷰", ok: !!a.jobplanetSummary, category: "web" },
    { label: "기업 프로필", ok: !!a.companyProfile, category: "web" },
    { label: "미션·비전", ok: !!(a.missionVision?.mission || a.missionVision?.vision), category: "web" },
    // AI 분석
    { label: "역량 근거", ok: (a.evidence?.length ?? 0) >= 2, category: "ai" },
    { label: "SWOT", ok: !!a.swot, category: "ai" },
    { label: "경쟁사 분석", ok: (a.competitors?.length ?? 0) > 0, category: "ai" },
    { label: "사업부문", ok: (a.businessSegments?.length ?? 0) > 0, category: "ai" },
  ];

  const byCategory = (cat: ReliabilityCheck["category"]) => {
    const sub = checks.filter((c) => c.category === cat);
    return sub.length === 0 ? 0 : Math.round((sub.filter((c) => c.ok).length / sub.length) * 100);
  };

  const categoryScores = {
    official: byCategory("official"),
    web: byCategory("web"),
    ai: byCategory("ai"),
  };

  const overall = Math.round(checks.filter((c) => c.ok).length / checks.length * 100);
  return { score: overall, checks, categoryScores };
}

const RELIABILITY_META = {
  official: { label: "공식 데이터 (DART)", color: "#3b82f6", desc: "상장·재무·공시 정보" },
  web: { label: "웹 수집 데이터", color: "#22c55e", desc: "뉴스·공고·리뷰·프로필" },
  ai: { label: "AI 분석 품질", color: "#a855f7", desc: "근거·SWOT·경쟁사·사업부문" },
} as const;

function ReliabilityModal({ analysis, isDark, onClose }: { analysis: CompanyAnalysis; isDark: boolean; onClose: () => void }) {
  const { score, checks, categoryScores } = computeReliability(analysis);

  const grade =
    score >= 85 ? { label: "A", color: "#10b981" }
    : score >= 65 ? { label: "B", color: "#3b82f6" }
    : score >= 45 ? { label: "C", color: "#f59e0b" }
    : { label: "D", color: "#ef4444" };

  const bg = isDark ? "#1e293b" : "#ffffff";
  const border = isDark ? "#334155" : "#e2e8f0";
  const textMuted = isDark ? "#94a3b8" : "#64748b";
  const textBase = isDark ? "#e2e8f0" : "#1e293b";
  const barBg = isDark ? "#334155" : "#f1f5f9";
  const overlayBg = isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: overlayBg, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: 24, width: 420, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: grade.color, fontVariantNumeric: "tabular-nums" }}>{grade.label}</span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: textBase, margin: 0 }}>데이터 신뢰도 {score}%</p>
              <p style={{ fontSize: 12, color: textMuted, margin: 0 }}>수집된 데이터 출처 기반 품질 평가</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: textMuted, padding: "4px 8px" }}>✕</button>
        </div>

        {/* 카테고리 바 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {(Object.entries(categoryScores) as [keyof typeof RELIABILITY_META, number][]).map(([cat, pct]) => {
            const meta = RELIABILITY_META[cat];
            return (
              <div key={cat}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: textMuted }}>{meta.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: textBase, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: barBg }}>
                  <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: meta.color, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* 세부 체크리스트 */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {(["official", "web", "ai"] as const).map((cat) => {
            const meta = RELIABILITY_META[cat];
            const catChecks = checks.filter((c) => c.category === cat);
            return (
              <div key={cat}>
                <p style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                  {catChecks.map((c) => (
                    <span key={c.label} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: c.ok ? textBase : (isDark ? "#475569" : "#cbd5e1") }}>
                      <span style={{ color: c.ok ? "#22c55e" : (isDark ? "#475569" : "#cbd5e1") }}>{c.ok ? "✓" : "✗"}</span>
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HrSection({ hr, isDark }: { hr: HrAnalysis; isDark: boolean }) {
  return (
    <div className="space-y-10">
      {/* HR Wheel */}
      {hr.hrWheel && hr.hrWheel.length > 0 && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>HR Wheel — 기능별 강조도</p>
          <div className="flex justify-center px-2 sm:px-6">
            <HrWheelChart areas={hr.hrWheel} isDark={isDark} />
          </div>
          <HrWheelLegend isDark={isDark} />
          {hr.hrWheel.some(w => w.evidence) && (
            <div className="mt-5 space-y-2">
              {hr.hrWheel.filter(w => w.evidence).map((w) => {
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

      {/* 울리치 모델 */}
      {hr.ulrichModel && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>울리치 모델 (Ulrich HR Model)</p>
          <div className="flex justify-center px-2 sm:px-6">
            <UlrichModelChart model={hr.ulrichModel} isDark={isDark} />
          </div>
          {hr.ulrichModel.description && (
            <p className={`text-sm leading-relaxed mt-4 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{hr.ulrichModel.description}</p>
          )}
        </div>
      )}

      {/* 경쟁 가치 모델 */}
      {hr.competingValues && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>경쟁 가치 모델 (CVF)</p>
          <div className="flex justify-center px-2 sm:px-6">
            <CvfChart cvf={hr.competingValues} isDark={isDark} />
          </div>
          {hr.competingValues.description && (
            <p className={`text-sm leading-relaxed mt-4 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{hr.competingValues.description}</p>
          )}
          {hr.competingValues.evidence && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {([
                ["clan", "클랜", "#22c55e"],
                ["adhocracy", "아드호크라시", "#8b5cf6"],
                ["hierarchy", "위계", "#3b82f6"],
                ["market", "시장", "#f97316"],
              ] as const).map(([key, label, color]) => {
                const evidence = hr.competingValues?.evidence?.[key];
                if (!evidence) return null;
                return (
                  <div key={key} className={`rounded-sm border px-3 py-2 ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className={`text-xs font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                        {label} {hr.competingValues?.[key]}%
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{evidence}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hr.dataCollectionNote && (
        <p className={`text-xs leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>📎 {hr.dataCollectionNote}</p>
      )}
    </div>
  );
}

function FinancialChart({ data, isDark }: { data: YearlyFinancial[]; isDark: boolean }) {
  const chartData = data.map((d) => ({
    year: `${d.year}`,
    매출액: d.revenue,
    영업이익: d.operatingProfit,
    순이익: d.netIncome,
    영업이익률: d.operatingMargin,
  }));

  const palette = {
    revenue: isDark ? "#9fb1c7" : "#1f3a5f",
    operatingProfit: isDark ? "#8fb7a5" : "#3f6f5a",
    netIncome: isDark ? "#b8a68b" : "#6f604b",
    margin: isDark ? "#d6a04b" : "#9a5a10",
    axis: isDark ? "#475569" : "#94a3b8",
    tick: isDark ? "#cbd5e1" : "#475569",
    grid: isDark ? "#334155" : "#d7dde6",
  };
  const tickStyle = { fill: palette.tick, fontSize: 11, fontFamily: "Georgia, 'Times New Roman', serif" };

  return (
    <div className={`border-y py-4 ${isDark ? "border-slate-700 bg-slate-900/30" : "border-slate-200 bg-zinc-50/60"}`}>
      <div className="mx-auto w-full max-w-4xl">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 2, bottom: 2 }}
            barGap={3}
            barCategoryGap="28%"
          >
            <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="year"
              tick={tickStyle}
              axisLine={{ stroke: palette.axis, strokeWidth: 1 }}
              tickLine={false}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              yAxisId="left"
              tick={tickStyle}
              axisLine={{ stroke: palette.axis, strokeWidth: 1 }}
              tickLine={false}
              tickFormatter={(v) => `${v}억`}
              width={56}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={tickStyle}
              axisLine={{ stroke: palette.axis, strokeWidth: 1 }}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={40}
            />
            <Tooltip
              cursor={{ fill: isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.04)" }}
              contentStyle={{
                backgroundColor: isDark ? "#111827" : "#fffdf8",
                borderColor: isDark ? "#475569" : "#cbd5e1",
                color: isDark ? "#f8fafc" : "#1f2937",
                fontSize: 12,
                borderRadius: 0,
                boxShadow: "none",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
              formatter={(value, name) => {
                const v = value as number | null | undefined;
                return name === "영업이익률"
                  ? [`${v ?? "—"}%`, name as string]
                  : [`${v?.toLocaleString() ?? "—"}억`, name as string];
              }}
            />
            <Legend
              iconType="square"
              wrapperStyle={{
                fontSize: 11,
                fontFamily: "Georgia, 'Times New Roman', serif",
                paddingTop: 12,
              }}
            />
            <Bar yAxisId="left" dataKey="매출액" fill={palette.revenue} radius={[0, 0, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="영업이익" fill={palette.operatingProfit} radius={[0, 0, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="순이익" fill={palette.netIncome} radius={[0, 0, 0, 0]} maxBarSize={28} />
            <Line
              yAxisId="right"
              dataKey="영업이익률"
              stroke={palette.margin}
              strokeWidth={2}
              dot={{ r: 3.5, fill: palette.margin, stroke: palette.margin }}
              activeDot={{ r: 5, fill: palette.margin, stroke: isDark ? "#111827" : "#fffdf8", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FinancialTable({ data, isDark }: { data: YearlyFinancial[]; isDark: boolean }) {
  const cols = [
    { label: "연도", render: (d: YearlyFinancial) => d.year },
    { label: "매출액", render: (d: YearlyFinancial) => d.revenueFormatted ?? "—" },
    { label: "영업이익", render: (d: YearlyFinancial) => d.operatingProfitFormatted ?? "—" },
    { label: "순이익", render: (d: YearlyFinancial) => d.netIncomeFormatted ?? "—" },
    { label: "영업이익률", render: (d: YearlyFinancial) => d.operatingMargin != null ? `${d.operatingMargin}%` : "—" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className={`border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            {cols.map((c) => (
              <th key={c.label} className={`pb-2 text-right first:text-left font-semibold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
          {data.map((d) => (
            <tr key={d.year}>
              {cols.map((c) => (
                <td key={c.label} className={`py-2 text-right first:text-left ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {String(c.render(d))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreDetailTable({
  scores,
  reasons,
  isDark,
}: {
  scores: CompetencyScores;
  reasons: CompetencyReasons | null;
  isDark: boolean;
}) {
  const [openKey, setOpenKey] = useState<keyof CompetencyScores | null>(null);

  return (
    <div className={`rounded-sm border ${isDark ? "border-slate-600 bg-slate-800" : "border-slate-300 bg-white"}`}>
      <div className={`px-4 py-2 border-b ${isDark ? "border-slate-600 bg-slate-700/50" : "border-slate-300 bg-slate-50"}`}>
        <p className={`text-sm font-semibold tracking-wide ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          세부 분석 항목 {reasons && <span className="font-normal ml-2 text-blue-600 text-xs">상세 내역 보기</span>}
        </p>
      </div>
      <div className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-200"}`}>
        {COMPETENCY_LABELS.map(({ key, label }) => {
          const v = scores[key] ?? 0;
          const reason = reasons?.[key];
          const isOpen = openKey === key;

          return (
            <div key={key}>
              <button
                onClick={() => reason && setOpenKey(isOpen ? null : key)}
                className={`w-full flex items-center gap-4 px-4 py-3 text-sm transition-colors ${reason ? `cursor-pointer ${isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}` : "cursor-default"
                  } ${isOpen ? (isDark ? "bg-slate-700" : "bg-blue-50/50") : ""}`}
              >
                <span className={`w-28 text-left shrink-0 font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-none overflow-hidden">
                  <div
                    className={`h-full transition-all ${v >= 80 ? "bg-blue-700"
                      : v >= 60 ? "bg-blue-500"
                        : v >= 40 ? "bg-slate-500"
                          : "bg-slate-400"
                      }`}
                    style={{ width: `${v}%` }}
                  />
                </div>
                <span className={`w-12 text-right font-mono text-sm shrink-0 ${v >= 70 ? "text-blue-700 font-semibold" : isDark ? "text-slate-400" : "text-slate-600"
                  }`}>
                  {v}
                </span>
                {reason ? (
                  <span className={`text-xs shrink-0 transition-transform ${isOpen ? "rotate-180" : ""} ${isDark ? "text-slate-400" : "text-slate-400"}`}>
                    ▼
                  </span>
                ) : (
                  <span className="w-2 shrink-0"></span>
                )}
              </button>

              {isOpen && reason && (
                <div className={`px-4 py-3 ${isDark ? "bg-slate-700/80 border-t border-slate-600" : "bg-slate-50 border-t border-slate-200"}`}>
                  <div className="flex gap-3">
                    <div className="shrink-0 font-semibold text-xs text-blue-700 uppercase tracking-widest mt-0.5">평가 근거</div>
                    <div className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      {reason}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CompanyAnalysisPage />
    </Suspense>
  );
}

function CompanyAnalysisPage() {
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrlHandled = useRef(false);

  const { cloudAiModels, localAiModels, isLoading: modelsLoading } = useModels();
  const [selectedModel, setSelectedModel] = useState("");
  useEffect(() => {
    if (selectedModel || modelsLoading) return;
    setSelectedModel(cloudAiModels[0]?.id ?? DEFAULT_FREE_MODEL_ID);
  }, [cloudAiModels, modelsLoading, selectedModel]);

  const [companies, setCompanies] = useState<CompanyAnalysis[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<CompanyAnalysis | null>(null);
  const [activeAnalysisKeys, setActiveAnalysisKeys] = useState<Set<string>>(() => new Set());
  const activeAnalysisKeysRef = useRef<Set<string>>(new Set());
  const activeAnalysisJobIdsRef = useRef<Set<string>>(new Set());
  const [activeAnalysisNames, setActiveAnalysisNames] = useState<string[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<Record<string, AnalysisRunProgress>>({});
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [logsVisible, setLogsVisible] = useState(false);
  const [error, setError] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const [reliabilityOpen, setReliabilityOpen] = useState(false);

  // ── 플로팅 채팅 ──────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatModel, setChatModel] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const chatBtnRef = useRef<HTMLButtonElement>(null);

  // chatModel 초기값: Haiku 우선, 없으면 마지막 클라우드 모델
  // dep를 string으로 유지해 배열 크기 변동 오류 방지
  const haikuModelId = cloudAiModels.find((m) => m.id.toLowerCase().includes("haiku"))?.id
    ?? cloudAiModels.at(-1)?.id
    ?? "";
  useEffect(() => {
    if (chatModel || !haikuModelId) return;
    setChatModel(haikuModelId);
  }, [haikuModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 채팅 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!chatOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chatPanelRef.current?.contains(target)) return;
      if (chatBtnRef.current?.contains(target)) return;
      setChatOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [chatOpen]);

  const refreshList = async () => {
    setLoadingList(true);
    try {
      setCompanies(await listCompanyAnalyses());
    } catch {
      setCompanies([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { refreshList(); }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [progressLogs]);

  // URL 파라미터: ?company=현대자동차 → 해당 기업 자동 선택 (최초 1회만)
  useEffect(() => {
    if (companies.length === 0 || initialUrlHandled.current) return;
    initialUrlHandled.current = true;
    const companyParam = searchParams.get("company");
    const errorParam = searchParams.get("error");
    if (errorParam) setError(decodeURIComponent(errorParam));
    if (companyParam) {
      const found = companies.find(
        (c) => c.companyName === companyParam || c.companyKey === companyParam,
      );
      if (found) handleSelect(found.companyKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => c.companyName.toLowerCase().includes(q));
  }, [companies, searchQuery]);

  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return null;
    return companies.find(
      (c) => c.companyName.toLowerCase().replace(/\s+/g, "") === q || c.companyKey === q,
    );
  }, [companies, searchQuery]);

  const apiModel = selectedModel === DEFAULT_FREE_MODEL_ID ? "" : selectedModel;
  const isAnalyzing = activeAnalysisKeys.size > 0;
  const isCompanyAnalyzing = (name: string) => activeAnalysisKeys.has(normalizeCompanyKey(name));
  const searchCompanyIsAnalyzing = searchQuery.trim() ? isCompanyAnalyzing(searchQuery.trim()) : false;
  const selectedCompanyIsAnalyzing = selected ? isCompanyAnalyzing(selected.companyName) : false;
  const analysisProgressItems = useMemo(
    () => Object.values(analysisProgress).sort((a, b) => a.updatedAt - b.updatedAt),
    [analysisProgress],
  );
  const progressPercent = useMemo(() => {
    if (analysisProgressItems.length === 0) return 0;
    const total = analysisProgressItems.reduce((sum, item) => sum + item.progress, 0);
    return Math.round(total / analysisProgressItems.length);
  }, [analysisProgressItems]);

  const markAnalysisStarted = (name: string, restored = false) => {
    const normalizedKey = normalizeCompanyKey(name);
    if (!normalizedKey || activeAnalysisKeysRef.current.has(normalizedKey)) return false;
    const startsNewBatch = activeAnalysisKeysRef.current.size === 0;
    if (startsNewBatch) {
      setAnalysisProgress({});
      setProgressLogs([]);
    }
    activeAnalysisKeysRef.current.add(normalizedKey);
    setActiveAnalysisKeys((prev) => new Set(prev).add(normalizedKey));
    setActiveAnalysisNames((prev) => prev.includes(name) ? prev : [...prev, name]);
    setAnalysisProgress((prev) => ({
      ...prev,
      [normalizedKey]: {
        key: normalizedKey,
        name,
        progress: restored ? 5 : 2,
        status: restored ? "running" : "pending",
        currentStep: restored ? "진행 상태 복원" : "요청 접수",
        updatedAt: Date.now(),
      },
    }));
    setProgressLogs((prev) => [
      ...prev,
      prev.length
        ? `--- ${name} ${restored ? '분석 진행 상태 복원' : '분석 요청'} ---`
        : `${name} ${restored ? '분석 진행 상태 복원' : '분석 요청'}`,
    ]);
    setError("");
    return true;
  };

  const markAnalysisFinished = (name: string) => {
    const normalizedKey = normalizeCompanyKey(name);
    activeAnalysisKeysRef.current.delete(normalizedKey);
    setActiveAnalysisKeys((prev) => {
      const next = new Set(prev);
      next.delete(normalizedKey);
      return next;
    });
    setActiveAnalysisNames((prev) => prev.filter((activeName) => normalizeCompanyKey(activeName) !== normalizedKey));
  };

  const handleAnalysisEvent = (name: string, ev: AnalyzeProgressEvent) => {
    const normalizedKey = normalizeCompanyKey(name);
    setAnalysisProgress((prev) => {
      const current = prev[normalizedKey] ?? {
        key: normalizedKey,
        name,
        progress: 0,
        status: "running" as AnalysisRunStatus,
        currentStep: "진행 중",
        updatedAt: Date.now(),
      };
      const nextProgress = estimateAnalysisProgress(ev, current.progress);
      const nextStatus: AnalysisRunStatus =
        ev.type === "done" ? "done" :
        ev.type === "error" ? "error" :
        "running";
      return {
        ...prev,
        [normalizedKey]: {
          ...current,
          name,
          progress: nextProgress,
          status: nextStatus,
          currentStep: getAnalysisStepLabel(ev, current.currentStep),
          lastMessage: "message" in ev ? ev.message ?? current.lastMessage : current.lastMessage,
          updatedAt: Date.now(),
        },
      };
    });
    if (ev.type === "log") {
      setProgressLogs((p) => [...p, `[${name}] ${ev.message}`]);
    } else if (ev.type === "searching") {
      setProgressLogs((p) => [...p, `[${name}] 외부 데이터 수집 및 웹 검색 진행 중`]);
    } else if (ev.type === "scoring") {
      setProgressLogs((p) => [...p, `[${name}] 인재상 기반 역량 모델 분석 처리 중`]);
    } else if (ev.type === "done") {
      setSelected(ev.result);
      setSearchQuery("");
      refreshList();
    } else if (ev.type === "error") {
      setError(`[${name}] ${ev.message}`);
    }
  };

  const runAnalysis = async (name: string) => {
    const normalizedKey = normalizeCompanyKey(name);
    if (!name || !normalizedKey || !markAnalysisStarted(name)) return;
    try {
      await analyzeCompanyStream(name, apiModel || undefined, (ev) => handleAnalysisEvent(name, ev));
    } catch (e) {
      const message = e instanceof Error ? e.message : "분석 처리 중 오류가 발생했습니다.";
      setError(`[${name}] ${message}`);
      setAnalysisProgress((prev) => {
        const current = prev[normalizedKey];
        if (!current) return prev;
        return {
          ...prev,
          [normalizedKey]: {
            ...current,
            status: "error",
            currentStep: "오류",
            lastMessage: message,
            updatedAt: Date.now(),
          },
        };
      });
    } finally {
      markAnalysisFinished(name);
    }
  };

  const handleAnalyze = () => runAnalysis(searchQuery.trim());
  const handleReanalyze = (companyName: string) => runAnalysis(companyName);

  useEffect(() => {
    const controllers: AbortController[] = [];
    let cancelled = false;

    getQueueStatus()
      .then((status) => {
        if (cancelled) return;
        const activeCompanyJobs = status.jobs.filter(
          (job) => job.taskType === "companyanalysis" && (job.status === "pending" || job.status === "running"),
        );
        const failedCompanyJobs = status.jobs.filter(
          (job) => job.taskType === "companyanalysis" && job.status === "error",
        );

        if (failedCompanyJobs.length > 0) {
          const latestFailed = failedCompanyJobs[failedCompanyJobs.length - 1];
          const companyName =
            latestFailed.companyName ||
            latestFailed.displayTitle?.replace(/\s*기업 분석\s*$/, "").trim() ||
            "기업";
          const message = latestFailed.errorMessage || latestFailed.result || "분석 처리 중 오류가 발생했습니다.";
          setError(`[${companyName}] ${message}`);
          setProgressLogs((prev) => [...prev, `[${companyName}] 오류: ${message}`]);
          const normalizedKey = normalizeCompanyKey(companyName);
          if (normalizedKey) {
            setAnalysisProgress((prev) => ({
              ...prev,
              [normalizedKey]: {
                key: normalizedKey,
                name: companyName,
                progress: 0,
                status: "error",
                currentStep: "오류",
                lastMessage: message,
                updatedAt: Date.now(),
              },
            }));
          }
        }

        for (const job of activeCompanyJobs) {
          if (activeAnalysisJobIdsRef.current.has(job.jobId)) continue;

          const companyName =
            job.companyName ||
            job.displayTitle?.replace(/\s*기업 분석\s*$/, "").trim() ||
            "기업";
          activeAnalysisJobIdsRef.current.add(job.jobId);
          markAnalysisStarted(companyName, true);

          const controller = new AbortController();
          controllers.push(controller);

          streamCompanyAnalysisJob(
            job.jobId,
            (event) => handleAnalysisEvent(companyName, event),
            controller.signal,
          )
            .catch((e) => {
              if (!controller.signal.aborted) {
                const message = e instanceof Error ? e.message : "분석 스트림 복원 중 오류가 발생했습니다.";
                setError(`[${companyName}] ${message}`);
                const normalizedKey = normalizeCompanyKey(companyName);
                setAnalysisProgress((prev) => {
                  const current = prev[normalizedKey];
                  if (!current) return prev;
                  return {
                    ...prev,
                    [normalizedKey]: {
                      ...current,
                      status: "error",
                      currentStep: "오류",
                      lastMessage: message,
                      updatedAt: Date.now(),
                    },
                  };
                });
              }
            })
            .finally(() => {
              activeAnalysisJobIdsRef.current.delete(job.jobId);
              markAnalysisFinished(companyName);
            });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = async (companyKey: string) => {
    try {
      const detail = await getCompanyAnalysis(companyKey);
      setSelected(detail);
      router.replace(`/company-analysis?company=${encodeURIComponent(detail.companyName)}`, { scroll: false });
    } catch { }
  };

  const handleDelete = async (companyKey: string) => {
    if (!confirm("해당 기업 분석 데이터를 삭제하시겠습니까?")) return;
    await deleteCompanyAnalysis(companyKey);
    if (selected?.companyKey === companyKey) setSelected(null);
    refreshList();
  };

  const radarData = useMemo(() => {
    if (!selected) return [];
    return COMPETENCY_LABELS.map(({ key, label }) => {
      const avg = companies.length > 0
        ? Math.round(companies.reduce((s, c) => s + (c.scores[key] ?? 0), 0) / companies.length)
        : 0;
      return {
        subject: label,
        value: selected.scores[key] ?? 0,
        avg,
        fullMark: 100,
      };
    });
  }, [selected, companies]);

  const recentNewsForDisplay = useMemo(() => {
    return (selected?.recentNews ?? [])
      .map((news) => ({ ...news, title: cleanNewsTitle(news.title) }))
      .filter((news) => isDisplayableNewsTitle(news.title, news.url));
  }, [selected?.recentNews]);

  // 기업 선택이 바뀌면 대화 초기화
  useEffect(() => {
    setChatMessages([]);
  }, [selected?.companyKey]);

  // 새 메시지 도착 시 스크롤 하단 이동
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // 채팅창 열릴 때 입력창에 포커스
  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [chatOpen]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");

    const nextMessages = [...chatMessages, { role: "user" as const, content: userMsg }];
    setChatMessages(nextMessages);
    setChatLoading(true);

    let assistantContent = "";
    setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // 상세 컨텍스트는 백엔드가 companyAnalysisKey로 DB에서 직접 주입한다.
    const systemPrompt = selected
      ? `당신은 ${selected.companyName} 기업 분석 AI 어시스턴트입니다. 제공된 기업 분석 산출물과 작성 근거를 바탕으로 질문에 명확하고 간결하게 한국어로 답변하세요. 이모지는 사용하지 마세요.`
      : "당신은 기업 분석 AI 어시스턴트입니다. 한국어로 답변하세요. 이모지는 사용하지 마세요.";

    try {
      const token = tokenStore.get();
      const res = await fetch(`${API_BASE}/chat/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg,
          model: chatModel === DEFAULT_FREE_MODEL_ID ? "" : chatModel || "",
          systemPrompt,
          companyAnalysisKey: selected?.companyKey,
          // 직전 대화 이력 (현재 user msg 제외, 최근 20개)
          history: chatMessages.slice(-20),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`채팅 API 오류 (${res.status})`);

      await readSSE<{ type: string; text?: string; message?: string }>(res, (ev) => {
        if (ev.type === "chunk" && ev.text) {
          assistantContent += ev.text;
          setChatMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: assistantContent },
          ]);
        }
        if (ev.type === "done" || ev.type === "error") return true;
      });
    } catch (e) {
      setChatMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const card = `border rounded-sm p-5 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`;

  return (
    <>
    <div className={`h-full flex flex-col font-sans overflow-hidden transition-all ${isGlass ? "p-3 bg-transparent" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}>
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all ${isGlass ? "glass-panel rounded-2xl shadow-xl border " + (isDark ? "border-white/20" : "border-black/5") : ""}`}>

        {/* 상단 헤더 */}
        <div className={`px-6 py-4 shrink-0 border-b ${isGlass ? (isDark ? "border-white/20" : "border-black/5") : isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-sm ${isDark ? "bg-slate-900 border-slate-600 focus-within:border-blue-500" : "bg-white border-slate-400 focus-within:border-blue-600"}`}>
              <svg className={`w-4 h-4 ${isDark ? "text-slate-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !searchCompanyIsAnalyzing && searchQuery.trim() && !exactMatch) handleAnalyze();
                  else if (e.key === "Enter" && exactMatch) setSelected(exactMatch);
                }}
                placeholder="대상 기업명을 검색하거나 신규 분석을 위해 입력하십시오"
                className={`flex-1 text-sm bg-transparent focus:outline-none ${isDark ? "text-slate-200 placeholder-slate-500" : "text-slate-800 placeholder-slate-400"}`}
              />
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={modelsLoading}
              className={`w-full md:w-48 text-sm px-3 py-2 border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none ${isDark ? "bg-slate-900 border-slate-600 text-slate-200" : "bg-white border-slate-400 text-slate-800"}`}
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: "no-repeat", backgroundPosition: "right .7rem top 50%", backgroundSize: ".65rem auto" }}
            >
              <option value={DEFAULT_FREE_MODEL_ID}>Gemini Model</option>
              {cloudAiModels.length > 0 && (
                <optgroup label="Cloud Models">
                  {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
              {localAiModels.length > 0 && (
                <optgroup label="Local Models">
                  {localAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
            </select>

            {searchQuery.trim() && !exactMatch && (
              <button
                onClick={handleAnalyze}
                disabled={searchCompanyIsAnalyzing}
                className={`w-full md:w-auto px-5 py-2 text-sm font-semibold rounded-sm border shrink-0 transition-colors ${isDark ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" : "bg-slate-800 border-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"}`}
              >
                {searchCompanyIsAnalyzing ? "이미 대기/분석 중" : "분석 실행"}
              </button>
            )}
          </div>

          {(isAnalyzing || analysisProgressItems.length > 0 || progressLogs.length > 0 || error) && (
            <div className={`mt-3 border rounded-sm text-sm font-mono ${isDark ? "bg-slate-900 text-slate-400 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-300"}`}>
              {error && (
                <div className={`px-4 py-2 border-b ${isDark ? "bg-red-950/30 text-red-300 border-red-900/60" : "bg-red-50 text-red-700 border-red-200"}`}>
                  [오류] {error}
                </div>
              )}
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="shrink-0">
                  <span className={`text-xs font-semibold uppercase tracking-widest ${isDark ? "text-slate-300" : "text-slate-700"}`}>기업 분석 진행률</span>
                  <span className="ml-2 text-[11px] opacity-60">
                    {analysisProgressItems.length > 0 ? `${analysisProgressItems.length}개 작업 평균` : "대기"}
                  </span>
                </div>
                <div className={`flex-1 h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-white border border-slate-200"}`}>
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-lg font-bold tabular-nums ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                    {Math.round(progressPercent)}%
                  </span>
                  <button
                    onClick={() => setLogsVisible((v) => !v)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${isDark ? "border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300" : "border-slate-300 hover:border-slate-400 text-slate-400 hover:text-slate-600"}`}
                  >
                    {logsVisible ? "숨기기" : "펼치기"}
                  </button>
                </div>
              </div>
              {logsVisible && analysisProgressItems.length > 0 && (
                <div className="px-4 pb-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {analysisProgressItems.map((item) => {
                    const statusText =
                      item.status === "done" ? "완료" :
                      item.status === "error" ? "오류" :
                      item.status === "pending" ? "대기" :
                      "진행 중";
                    const statusClass =
                      item.status === "done" ? (isDark ? "text-emerald-300 border-emerald-900 bg-emerald-950/30" : "text-emerald-700 border-emerald-200 bg-emerald-50") :
                      item.status === "error" ? (isDark ? "text-red-300 border-red-900 bg-red-950/30" : "text-red-700 border-red-200 bg-red-50") :
                      item.status === "pending" ? (isDark ? "text-amber-300 border-amber-900 bg-amber-950/30" : "text-amber-700 border-amber-200 bg-amber-50") :
                      (isDark ? "text-blue-300 border-blue-900 bg-blue-950/30" : "text-blue-700 border-blue-200 bg-blue-50");
                    return (
                      <div key={item.key} className={`rounded-sm border p-3 ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>{item.name}</div>
                            <div className="mt-0.5 text-xs truncate">{item.currentStep}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 border rounded-sm ${statusClass}`}>{statusText}</span>
                            <span className={`text-sm font-bold tabular-nums ${isDark ? "text-blue-300" : "text-blue-700"}`}>{Math.round(item.progress)}%</span>
                          </div>
                        </div>
                        <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${item.status === "error" ? "bg-red-500" : item.status === "done" ? "bg-emerald-500" : "bg-blue-600"}`}
                            style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {ANALYSIS_DETAIL_STEPS.map((step) => {
                            const reached = item.progress >= step.threshold;
                            const current = !reached && item.progress >= step.threshold - 8;
                            const cls = reached
                              ? isDark ? "border-blue-800 bg-blue-950/40 text-blue-300" : "border-blue-200 bg-blue-50 text-blue-700"
                              : current
                              ? isDark ? "border-slate-600 bg-slate-800 text-slate-300" : "border-slate-300 bg-slate-50 text-slate-600"
                              : isDark ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400";
                            return (
                              <span key={step.label} className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${cls}`}>
                                {step.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {logsVisible && (
                <div className="px-4 pb-2 max-h-36 overflow-y-auto flex flex-col gap-1 text-xs border-t border-current border-opacity-10 pt-2">
                  {progressLogs.map((l, i) => <div key={i}>{">"} {l}</div>)}
                  {isAnalyzing && (
                    <div className="text-blue-600 mt-1">
                      {">"} 대기/분석 중: {activeAnalysisNames.join(", ")}
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* 좌측 목록 — 모바일에서 선택 시 숨김 */}
          <div className={`w-full md:w-72 shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r ${selected ? "hidden md:block" : "flex-1 md:flex-none"} ${isGlass ? (isDark ? "border-white/20" : "border-black/10") : isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}>
            {loadingList ? (
              <div className={`p-5 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>데이터 불러오는 중...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className={`p-6 text-sm text-center border-b ${isDark ? "text-slate-500 border-slate-700" : "text-slate-400 border-slate-200"}`}>
                해당하는 데이터가 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredCompanies.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => handleSelect(c.companyKey)}
                      className={`w-full text-left px-4 py-3 transition-colors ${selected?.companyKey === c.companyKey
                        ? (isDark ? "bg-slate-700/50 border-l-4 border-blue-500" : "bg-blue-50/50 border-l-4 border-blue-700")
                        : (isDark ? "hover:bg-slate-700/30 border-l-4 border-transparent" : "hover:bg-slate-50 border-l-4 border-transparent")}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>{c.companyName}</span>
                        <div
                          role="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(c.companyKey); }}
                          className={`text-xs px-1 hover:text-red-600 ${isDark ? "text-slate-500" : "text-slate-400"}`}
                          title="삭제"
                        >
                          ✕
                        </div>
                      </div>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        {new Date(c.updatedAt).toLocaleDateString("ko-KR")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 우측 상세 */}
          <div className={`flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8 ${isGlass ? "" : isDark ? "bg-slate-900" : "bg-[#f4f5f7]"}`}>
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className={`w-16 h-16 mb-4 border-2 rounded ${isDark ? "border-slate-700 text-slate-700" : "border-slate-300 text-slate-300"} flex items-center justify-center`}>
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M9 17v-2m4 2v-4m4 4V9M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>상단 검색창에 대상 기업명을 입력하여 자동 수집 및 분석을 실행하십시오.</p>
              </div>
            ) : (
              <div className="max-w-5xl mx-auto space-y-6">

                {/* 헤더 */}
                <div className={`border-b pb-4 ${isDark ? "border-slate-700" : "border-slate-300"}`}>
                  {/* 모바일 뒤로가기 */}
                  <button
                    className={`md:hidden flex items-center gap-1 text-sm mb-3 ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                    onClick={() => setSelected(null)}
                  >
                    ← 목록
                  </button>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* 회사명 + 링크 */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight break-words ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                          {selected.companyName}
                        </h2>
                        {selected.homeUrl && (
                          <a
                            href={selected.homeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="공식 홈페이지"
                            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-sm transition-colors shrink-0 ${isDark ? "border-slate-600 text-blue-400 hover:bg-slate-800" : "border-slate-300 text-blue-600 hover:bg-slate-50"}`}
                          >
                            홈페이지 ↗
                          </a>
                        )}
                      </div>

                      {/* 모바일: 간략 정보 줄 */}
                      <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                        <span>{new Date(selected.updatedAt).toLocaleDateString("ko-KR")}</span>
                        <span className="truncate max-w-[140px]">{selected.aiModel?.split("-").slice(0, 3).join("-") || "Unknown"}</span>
                        {selected.estimatedFees != null && selected.estimatedFees > 0 && (
                          <span className="text-amber-500 font-semibold">${selected.estimatedFees.toFixed(4)}</span>
                        )}
                        {(() => {
                          const { score } = computeReliability(selected);
                          const gradeLabel = score >= 85 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D";
                          return (
                            <button
                              onClick={() => setReliabilityOpen(true)}
                              className={`inline-flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-70 ${isDark ? "text-slate-400" : "text-slate-500"}`}
                            >
                              신뢰도 {gradeLabel} · {score}%
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0"><path d="M2 8L8 2M8 2H3M8 2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          );
                        })()}
                      </div>

                      {/* 데스크탑: 풀 정보 줄 */}
                      <p className={`hidden sm:block text-sm mt-2 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        DATE: {new Date(selected.updatedAt).toLocaleString("en-US", { hour12: false })} | MODEL: {selected.aiModel || "Unknown"}
                        {(selected.inputTokens != null || selected.outputTokens != null) && (
                          <span className="ml-3">
                            | IN: {(selected.inputTokens ?? 0).toLocaleString()} / OUT: {(selected.outputTokens ?? 0).toLocaleString()} tokens
                            {selected.estimatedFees != null && selected.estimatedFees > 0 && (
                              <span className="ml-2 text-amber-500">${selected.estimatedFees.toFixed(4)}</span>
                            )}
                          </span>
                        )}
                        {(() => {
                          const { score } = computeReliability(selected);
                          const gradeLabel = score >= 85 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D";
                          return (
                            <button
                              onClick={() => setReliabilityOpen(true)}
                              className={`ml-3 inline-flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-70 ${isDark ? "text-slate-400" : "text-slate-500"}`}
                            >
                              신뢰도 {gradeLabel} · {score}%
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0"><path d="M2 8L8 2M8 2H3M8 2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          );
                        })()}
                      </p>
                    </div>

                    {/* 재분석 버튼 — nowrap 고정 */}
                    <button
                      onClick={() => handleReanalyze(selected.companyName)}
                      disabled={selectedCompanyIsAnalyzing}
                      className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold border rounded-sm transition-colors ${isDark ? "border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50" : "border-slate-400 text-slate-700 hover:bg-slate-100 disabled:opacity-50"}`}
                    >
                      {selectedCompanyIsAnalyzing ? "분석 중" : "재분석"}
                    </button>
                  </div>
                </div>

                {/* 요약 */}
                {selected.summary && (
                  <section className={`p-5 border-l-4 rounded-r-sm ${isDark ? "bg-slate-800 border-blue-600" : "bg-white border-blue-800 shadow-sm"}`}>
                    <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 ${isDark ? "text-blue-400" : "text-blue-800"}`}>Overall Summary</h3>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.summary}</p>
                  </section>
                )}

                {/* 기업 개요 카드 */}
                {(selected.ceoName || selected.foundedDate || selected.corpClass || selected.industry || selected.companySize || selected.address || selected.dartUrl || selected.creditRating || selected.jobPostings?.length) && (
                  <section className={card}>
                    <SectionHeader title="기업 개요 (Company Overview)" badge="INFO" isDark={isDark} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                      {selected.ceoName && (
                        <InfoItem label="대표이사" isDark={isDark}>{selected.ceoName}</InfoItem>
                      )}
                      {selected.foundedDate && (
                        <InfoItem label="설립일" isDark={isDark}>
                          {selected.foundedDate.length === 8
                            ? `${selected.foundedDate.slice(0, 4)}.${selected.foundedDate.slice(4, 6)}.${selected.foundedDate.slice(6, 8)}`
                            : selected.foundedDate}
                        </InfoItem>
                      )}
                      {selected.corpClass && (
                        <InfoItem label="상장구분" isDark={isDark}>
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-block px-2 py-0.5 text-xs rounded-sm font-semibold ${selected.corpClass === "Y" ? "bg-blue-100 text-blue-700" : selected.corpClass === "K" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
                              {CORP_CLASS_LABEL[selected.corpClass] ?? selected.corpClass}
                            </span>
                            {(selected.corpClass === "Y" || selected.corpClass === "K") && selected.stockCode && (
                              <a
                                href={`https://www.tossinvest.com/stocks/A${selected.stockCode}/order`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-0.5 text-xs hover:underline shrink-0 ${isDark ? "text-blue-400" : "text-blue-600"}`}
                              >
                                토스증권 ↗
                              </a>
                            )}
                          </span>
                        </InfoItem>
                      )}
                      {selected.industry && (
                        <InfoItem label="업종" isDark={isDark}>{selected.industry}</InfoItem>
                      )}
                      {selected.companySize && (
                        <InfoItem label="기업 규모" isDark={isDark}>
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-sm font-semibold ${
                            selected.companySize === "대기업"   ? "bg-blue-100 text-blue-800" :
                            selected.companySize === "중견기업" ? "bg-violet-100 text-violet-800" :
                            selected.companySize === "스타트업" ? "bg-emerald-100 text-emerald-800" :
                                                                 "bg-slate-100 text-slate-700"
                          }`}>
                            {selected.companySize}
                          </span>
                        </InfoItem>
                      )}
                      {selected.creditRating && (
                        <InfoItem label="신용등급" isDark={isDark}>
                          <span className="font-bold font-mono text-base">{selected.creditRating}</span>
                        </InfoItem>
                      )}
                      {selected.employeeHistory && selected.employeeHistory.length > 0 ? (() => {
                        const hist = selected.employeeHistory!;
                        const latest = hist[hist.length - 1];
                        const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
                        const delta = (prev?.total != null && latest.total != null)
                          ? latest.total - prev.total : null;
                        const deltaSign = delta != null ? (delta > 0 ? "+" : "") : "";
                        const deltaPct = (delta != null && prev?.total)
                          ? ((delta / prev.total) * 100).toFixed(1) : null;
                        return (
                          <div className={`col-span-2 md:col-span-3 p-4 rounded-sm border ${isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                            {/* 헤더: 출처 */}
                            <div className="flex items-center justify-between mb-3">
                              <p className={`text-[10px] font-semibold uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                                임직원 현황
                              </p>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-white text-slate-400 border-slate-300"}`}>
                                DART 전자공시시스템 ({hist.map(e => e.year).join(" · ")}년)
                              </span>
                            </div>
                            {/* 총계 + 증감 */}
                            <div className={`flex flex-wrap gap-4 mb-3 pb-3 border-b ${isDark ? "border-slate-600" : "border-slate-200"}`}>
                              {latest.total != null && (
                                <span className={`text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                                  총 직원수 {latest.total.toLocaleString()}명
                                </span>
                              )}
                              {delta != null && (
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${delta > 0 ? (isDark ? "text-emerald-400" : "text-emerald-700") : delta < 0 ? (isDark ? "text-red-400" : "text-red-700") : (isDark ? "text-slate-400" : "text-slate-500")}`}>
                                  {deltaSign}{delta.toLocaleString()}명 ({deltaSign}{deltaPct}%) vs {prev!.year}년
                                </span>
                              )}
                              {latest.avgTenure && (
                                <span className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                  평균 근속연수 {latest.avgTenure}
                                </span>
                              )}
                              {latest.avgSalary && (
                                <span className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                  평균급여 {latest.avgSalary}
                                </span>
                              )}
                            </div>
                            {/* 상세 */}
                            <div className="space-y-1.5 text-xs">
                              {(latest.regular != null || latest.contract != null) && (
                                <div className="flex gap-2">
                                  <span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>근무형태</span>
                                  <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                                    {[
                                      latest.regular != null && latest.total ? `정규직 ${latest.regular.toLocaleString()}명(${Math.round(latest.regular / latest.total * 100)}%)` : null,
                                      latest.contract != null && latest.total ? `계약직 ${latest.contract.toLocaleString()}명(${Math.round(latest.contract / latest.total * 100)}%)` : null,
                                    ].filter(Boolean).join("  ")}
                                  </span>
                                </div>
                              )}
                              {(latest.maleCount != null || latest.femaleCount != null) && (
                                <div className="flex gap-2">
                                  <span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>성별</span>
                                  <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                                    {[
                                      latest.maleCount != null && latest.total ? `남성 ${latest.maleCount.toLocaleString()}명(${Math.round(latest.maleCount / latest.total * 100)}%)` : null,
                                      latest.femaleCount != null && latest.total ? `여성 ${latest.femaleCount.toLocaleString()}명(${Math.round(latest.femaleCount / latest.total * 100)}%)` : null,
                                    ].filter(Boolean).join("  ")}
                                  </span>
                                </div>
                              )}
                              {(latest.maleTenure || latest.femaleTenure) && (
                                <div className="flex gap-2">
                                  <span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>근속연수</span>
                                  <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                                    남성 {latest.maleTenure ?? "—"} / 여성 {latest.femaleTenure ?? "—"}
                                  </span>
                                </div>
                              )}
                              {(latest.maleSalary || latest.femaleSalary) && (
                                <div className="flex gap-2">
                                  <span className={`shrink-0 w-16 font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>평균급여</span>
                                  <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                                    남성 {latest.maleSalary ?? "—"} / 여성 {latest.femaleSalary ?? "—"}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })() : selected.employees ? (
                        <InfoItem label="사원수" isDark={isDark}>{selected.employees}</InfoItem>
                      ) : null}
                      {(selected.multiYearFinancials?.at(-1)?.revenueFormatted) && (
                        <InfoItem label={`매출 (${selected.multiYearFinancials!.at(-1)!.year})`} isDark={isDark}>
                          {selected.multiYearFinancials!.at(-1)!.revenueFormatted}
                        </InfoItem>
                      )}
                      {selected.capital && (
                        <InfoItem label="자본금" isDark={isDark}>{selected.capital}</InfoItem>
                      )}
                    </div>

                    {selected.address && (
                      <div className="mt-4">
                        <InfoItem label="주소" isDark={isDark}>
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>{selected.address}</span>
                            <a
                              href={`https://map.naver.com/v5/search/${encodeURIComponent(selected.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-0.5 text-xs hover:underline shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}
                            >
                              지도 ↗
                            </a>
                            <a
                              href={selected.apartmentPrices?.naverLandUrl ?? buildZippoomApartmentUrl(selected.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-0.5 text-xs hover:underline shrink-0 ${isDark ? "text-orange-400" : "text-orange-600"}`}
                            >
                              부동산 ↗
                            </a>
                            {formatApartmentPriceSummary(selected.apartmentPrices) && (
                              <span className={`inline-flex items-center gap-1 text-xs shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                <span className={isDark ? "text-slate-600" : "text-slate-300"}>|</span>
                                <span>{formatApartmentPriceSummary(selected.apartmentPrices)}</span>
                              </span>
                            )}
                          </span>
                        </InfoItem>
                      </div>
                    )}

                    {selected.dartUrl && (
                      <div className="mt-4">
                        <InfoItem label="DART 공시" isDark={isDark}>
                          <a href={selected.dartUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs hover:underline ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                            공시 바로가기 ↗
                          </a>
                        </InfoItem>
                      </div>
                    )}

                    {selected.hrAnalysis?.careerPageUrl && (
                      <div className="mt-4">
                        <InfoItem label="채용 공고 사이트" isDark={isDark}>
                          <a href={selected.hrAnalysis.careerPageUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs hover:underline ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                            공식 채용 페이지 ↗
                          </a>
                        </InfoItem>
                      </div>
                    )}

                    {selected.jobPostings && selected.jobPostings.length > 0 && (
                      <div className={`mt-4 pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>채용 공고</p>
                        <ul className="space-y-1.5">
                          {selected.jobPostings.slice(0, 5).map((j, i) => (
                            <li key={i} className="flex items-center gap-3">
                              <span className={`text-xs font-mono shrink-0 ${isDark ? "text-slate-600" : "text-slate-400"}`}>{i + 1}</span>
                              <a
                                href={j.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-xs hover:underline truncate flex-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}
                              >
                                {j.title}
                              </a>
                              {j.date && (
                                <span className={`text-xs font-mono shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{j.date}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  </section>
                )}

                {/* 기업 프로파일 */}
                {selected.companyProfile && (
                  <section className={card}>
                    <SectionHeader title="기업 프로파일 (Company Profile)" badge="AI" isDark={isDark} />
                    <div className="space-y-5">
                      {selected.companyProfile.businessArea && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>사업영역</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.businessArea}</p>
                        </div>
                      )}
                      {selected.companyProfile.businessStatus && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>사업현황</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.businessStatus}</p>
                        </div>
                      )}
                      {selected.companyProfile.coreValues?.length > 0 && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>핵심가치</p>
                          <div className="flex flex-wrap gap-2">
                            {selected.companyProfile.coreValues.map((v) => (
                              <span key={v} className={`inline-block px-3 py-1 text-xs font-medium border rounded-sm ${isDark ? "bg-blue-900/30 text-blue-300 border-blue-700/50" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.companyProfile.jobIntroduction && selected.companyProfile.jobIntroduction.length > 0 && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>직무소개</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selected.companyProfile.jobIntroduction.map((job) => (
                              <div key={job.name} className={`px-3 py-2 rounded-sm border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                                <p className={`text-xs font-semibold mb-0.5 ${isDark ? "text-blue-400" : "text-blue-700"}`}>{job.name}</p>
                                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>{job.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.companyProfile.historyAchievements && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>역사 및 주요 업적</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.historyAchievements}</p>
                        </div>
                      )}
                      {selected.companyProfile.socialContribution && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>사회공헌활동</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.socialContribution}</p>
                        </div>
                      )}
                      {(selected.companyProfile.employeeCount || selected.companyProfile.brandImage || selected.companyProfile.specialNotes) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selected.companyProfile.employeeCount && (
                            <InfoItem label="임직원수" isDark={isDark}>{selected.companyProfile.employeeCount}</InfoItem>
                          )}
                          {selected.companyProfile.brandImage && (
                            <div className="md:col-span-2">
                              <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>CI · 브랜드 이미지</p>
                              <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.brandImage}</p>
                            </div>
                          )}
                          {selected.companyProfile.specialNotes && (
                            <div className={`md:col-span-2 p-3 rounded-sm border-l-4 ${isDark ? "bg-amber-900/20 border-amber-500" : "bg-amber-50 border-amber-400"}`}>
                              <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${isDark ? "text-amber-400" : "text-amber-700"}`}>특기 사항</p>
                              <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.specialNotes}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {(selected.companyProfile.businessPromotion || selected.companyProfile.currentYearGoal || selected.companyProfile.nextYearGoal) && (
                        <div className={`pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${isDark ? "text-slate-500" : "text-slate-400"}`}>전략 및 목표</p>
                          <div className="space-y-3">
                            {selected.companyProfile.businessPromotion && (
                              <div>
                                <p className={`text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>사업 추진</p>
                                <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.businessPromotion}</p>
                              </div>
                            )}
                            {selected.companyProfile.currentYearGoal && (
                              <div>
                                <p className={`text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>올해 목표</p>
                                <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.currentYearGoal}</p>
                              </div>
                            )}
                            {selected.companyProfile.nextYearGoal && (
                              <div>
                                <p className={`text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>내년 목표</p>
                                <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.companyProfile.nextYearGoal}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* 사업 부문 */}
                {selected.businessSegments && selected.businessSegments.length > 0 && (
                  <section className={card}>
                    <SectionHeader title="사업 부문 (Business Segments)" badge="AI" isDark={isDark} />
                    <div className="space-y-4">
                      {selected.segmentSources && selected.segmentSources.length > 0 && (
                        <div className={`flex flex-wrap gap-2 pb-1 mb-2 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                          <span className={`text-[10px] font-semibold self-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>출처</span>
                          {selected.segmentSources.map((src, si) => (
                            <a key={si} href={src.url} target="_blank" rel="noopener noreferrer"
                              className={`text-[11px] px-2 py-0.5 rounded-sm border truncate max-w-[280px] hover:underline ${isDark ? "bg-slate-800 text-blue-400 border-slate-700 hover:text-blue-300" : "bg-white text-blue-600 border-slate-200 hover:text-blue-800"}`}
                              title={src.title}>
                              {src.title.length > 40 ? src.title.slice(0, 40) + '…' : src.title}
                            </a>
                          ))}
                        </div>
                      )}
                      {selected.businessSegments.map((seg, i) => (
                        <div key={i} className={`p-4 rounded-sm border ${isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                          {/* 부문명 + 비중 */}
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                              {seg.name}
                            </span>
                            {seg.revenueShare && (
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-sm border ${isDark ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                매출비중 {seg.revenueShare}
                              </span>
                            )}
                            {seg.corporateCount && (
                              <span className={`text-xs font-mono px-2 py-0.5 rounded-sm border ${isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-white text-slate-500 border-slate-300"}`}>
                                법인 {seg.corporateCount}
                              </span>
                            )}
                          </div>
                          {/* 종속회사 */}
                          {seg.subsidiaries && seg.subsidiaries.length > 0 && (
                            <div className="flex gap-2 mb-2">
                              <span className={`shrink-0 text-xs font-semibold w-16 mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>종속회사</span>
                              <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                {seg.subsidiaries.join(", ")}
                              </p>
                            </div>
                          )}
                          {/* 주요제품 */}
                          {seg.mainProducts && (
                            <div className="flex gap-2 mb-2">
                              <span className={`shrink-0 text-xs font-semibold w-16 mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>주요제품</span>
                              <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>{seg.mainProducts}</p>
                            </div>
                          )}
                          {/* 설명 */}
                          {seg.description && (
                            <p className={`text-xs leading-relaxed mt-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{seg.description}</p>
                          )}
                          {/* 시설/거점 */}
                          {seg.facilities && (
                            <div className={`mt-2 pt-2 border-t text-xs ${isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-500"}`}>
                              {seg.facilities}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 경쟁사 분석 */}
                {selected.competitors && selected.competitors.length > 0 && (
                  <section className={card}>
                    <SectionHeader title="경쟁사 분석 (Competitors)" badge="CRAWLED" isDark={isDark} />
                    <div className="space-y-3">
                      {selected.competitors.map((comp, i) => {
                        const threat = comp.threatLevel ?? 'medium';
                        const threatConfig = {
                          high: { label: '위협 높음', cls: isDark ? 'bg-red-900/40 text-red-300 border-red-700/50' : 'bg-red-50 text-red-700 border-red-200' },
                          medium: { label: '위협 중간', cls: isDark ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' : 'bg-yellow-50 text-yellow-700 border-yellow-200' },
                          low: { label: '위협 낮음', cls: isDark ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-slate-100 text-slate-500 border-slate-200' },
                        }[threat];
                        return (
                          <div key={i} className={`p-4 rounded-sm border ${isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <p className={`text-sm font-semibold ${isDark ? "text-blue-300" : "text-blue-700"}`}>{comp.name}</p>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${threatConfig.cls}`}>{threatConfig.label}</span>
                              {comp.marketScope && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${isDark ? "bg-slate-700 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                  {comp.marketScope === "domestic" ? "국내" : "해외·국내 영향"}
                                </span>
                              )}
                              {comp.siteUrl && (
                                <a href={comp.siteUrl} target="_blank" rel="noopener noreferrer" className={`ml-auto text-xs hover:underline ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"}`}>
                                  사이트 ↗
                                </a>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex gap-2">
                                <span className={`shrink-0 text-xs font-semibold w-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>경쟁 이유</span>
                                <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{comp.reason}</p>
                              </div>
                              <div className="flex gap-2">
                                <span className={`shrink-0 text-xs font-semibold w-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>필요 역량</span>
                                <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{comp.needed}</p>
                              </div>
                              {comp.sourceUrl && (
                                <div className="flex gap-2">
                                  <span className={`shrink-0 text-xs font-semibold w-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>크롤링 근거</span>
                                  <a
                                    href={comp.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`text-sm leading-relaxed hover:underline truncate ${isDark ? "text-blue-400" : "text-blue-700"}`}
                                  >
                                    {comp.sourceTitle || comp.sourceUrl}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* 경영이념·인재상 */}
                {selected.missionVision && (selected.missionVision.mission || selected.missionVision.vision || selected.missionVision.coreValues?.length || selected.missionVision.talentProfile) && (
                  <section className={card}>
                    <SectionHeader title="경영이념 · 인재상 (Mission & Values)" badge="AI" isDark={isDark} />
                    <div className="space-y-5">
                      {selected.missionVision.mission && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>미션 (Mission)</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.missionVision.mission}</p>
                        </div>
                      )}
                      {selected.missionVision.vision && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>비전 (Vision)</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.missionVision.vision}</p>
                        </div>
                      )}
                      {selected.missionVision.coreValues?.length > 0 && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>핵심 가치 (Core Values)</p>
                          <div className="flex flex-wrap gap-2">
                            {selected.missionVision.coreValues.map((v) => (
                              <span key={v} className={`inline-block px-3 py-1 text-xs font-medium border rounded-sm ${isDark ? "bg-blue-900/30 text-blue-300 border-blue-700/50" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.missionVision.talentProfile && (
                        <div className={`p-4 rounded-sm border-l-4 ${isDark ? "bg-slate-700/40 border-amber-500" : "bg-amber-50 border-amber-500"}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${isDark ? "text-amber-400" : "text-amber-700"}`}>인재상</p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selected.missionVision.talentProfile}</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* HR Section */}
                {selected.hrAnalysis && (
                  <section className={card}>
                    <SectionHeader title="HR 분석 (Human Resources)" badge="AI" isDark={isDark} />
                    <HrSection hr={selected.hrAnalysis} isDark={isDark} />
                    {selected.hrTechSources && selected.hrTechSources.length > 0 && (
                      <div className={`mt-6 pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>기술 조직·HRD 크롤링 근거</p>
                        <ul className="space-y-1.5">
                          {selected.hrTechSources.slice(0, 8).map((src, i) => (
                            <li key={i} className="flex items-center gap-2 min-w-0">
                              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${isDark ? "bg-slate-700 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                {src.category}
                              </span>
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-xs hover:underline truncate ${isDark ? "text-blue-400" : "text-blue-700"}`}
                              >
                                {src.title || src.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                )}

                {/* SWOT */}
                {selected.swot && (selected.swot.S?.length || selected.swot.W?.length || selected.swot.O?.length || selected.swot.T?.length) && (
                  <section className={card}>
                    <SectionHeader title="SWOT 분석" badge="AI" isDark={isDark} />
                    <SwotGrid swot={selected.swot} isDark={isDark} />
                  </section>
                )}

                {/* 재무 현황 차트 + 테이블 */}
                {selected.multiYearFinancials && selected.multiYearFinancials.length > 0 && (
                  <section className={card}>
                    <SectionHeader title="재무 현황 (Financial Overview)" badge="DART" isDark={isDark} />
                    <FinancialChart data={selected.multiYearFinancials} isDark={isDark} />
                    <div className="mt-6">
                      <FinancialTable data={selected.multiYearFinancials} isDark={isDark} />
                    </div>
                  </section>
                )}

                {/* 역량 프로파일 + 세부 점수 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <section className={`border rounded-sm p-6 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300 shadow-sm"}`}>
                    <SectionHeader title="역량 프로파일" isDark={isDark} />
                    <div className="h-[540px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} outerRadius="72%">
                          <PolarGrid stroke={isDark ? "#475569" : "#cbd5e1"} />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fill: isDark ? "#cbd5e1" : "#475569", fontSize: 11, fontWeight: 500 }}
                          />
                          <PolarRadiusAxis
                            angle={90}
                            domain={[0, 100]}
                            tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark ? "#1e293b" : "#ffffff",
                              borderColor: isDark ? "#334155" : "#e2e8f0",
                              color: isDark ? "#f8fafc" : "#0f172a",
                              fontSize: "12px",
                              borderRadius: "2px",
                              boxShadow: "none",
                            }}
                          />
                          {companies.length > 0 && (
                          <Radar
                            name="시장 평균 (Market Avg)"
                            dataKey="avg"
                            stroke={isDark ? "#64748b" : "#cbd5e1"}
                            strokeDasharray="3 3"
                            fill="none"
                            strokeWidth={1.5}
                          />
                          )}
                          <Radar
                            name={selected.companyName}
                            dataKey="value"
                            stroke={isDark ? "#3b82f6" : "#1d4ed8"}
                            fill={isDark ? "#3b82f6" : "#1d4ed8"}
                            fillOpacity={0.15}
                            strokeWidth={2}
                          />
                          <Legend wrapperStyle={{ paddingTop: 20, fontSize: 11, fontFamily: "monospace" }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <div className="space-y-6">
                    <ScoreDetailTable scores={selected.scores} reasons={selected.reasons} isDark={isDark} />
                  </div>
                </div>

                {/* 잡플래닛 조직문화 */}
                {selected.jobplanetSummary && (
                  <section className={card}>
                    <SectionHeader title="조직 문화 (Corporate Culture)" badge="REVIEW" isDark={isDark} />
                    <pre className={`text-sm leading-relaxed font-sans whitespace-pre-wrap ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      {selected.jobplanetSummary}
                    </pre>
                  </section>
                )}

                {/* 기업 분석 보고서 */}
                {selected.report && (
                  <section className={card}>
                    <SectionHeader title="기업 분석 보고서 (Company Report)" badge="AI" isDark={isDark} />
                    <div className="space-y-4">
                      {selected.report.split(/\n\n+/).map((paragraph, i) => {
                        if (paragraph.startsWith("## ")) {
                          return (
                            <h4 key={i} className={`text-sm font-medium mt-2 first:mt-0 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              {paragraph.replace(/^## \d+\. /, "")}
                            </h4>
                          );
                        }
                        return (
                          <p key={i} className={`text-sm font-normal leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            {paragraph}
                          </p>
                        );
                      })}
                    </div>
                  </section>
                )}


                {/* 최근 뉴스 */}
                {recentNewsForDisplay.length > 0 && (
                  <section className={card}>
                    <SectionHeader title="최근 주요 기사 (Recent News)" badge="WEB" isDark={isDark} />
                    <ul className="space-y-3">
                      {recentNewsForDisplay.map((n, i) => (
                        <li key={i} className={`pb-3 ${i < recentNewsForDisplay.length - 1 ? `border-b ${isDark ? "border-slate-700" : "border-slate-100"}` : ""}`}>
                          <div className="flex items-start gap-3">
                            <span className={`text-xs font-mono mt-0.5 shrink-0 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{String(i + 1).padStart(2, "0")}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                {n.category && (
                                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${
                                    n.category === "신사업"   ? (isDark ? "bg-blue-900/40 text-blue-300 border-blue-700/50"     : "bg-blue-50 text-blue-700 border-blue-200") :
                                    n.category === "B2B확장" ? (isDark ? "bg-violet-900/40 text-violet-300 border-violet-700/50" : "bg-violet-50 text-violet-700 border-violet-200") :
                                    n.category === "법적분쟁"? (isDark ? "bg-red-900/40 text-red-300 border-red-700/50"         : "bg-red-50 text-red-700 border-red-200") :
                                    n.category === "경영진"  ? (isDark ? "bg-amber-900/40 text-amber-300 border-amber-700/50"   : "bg-amber-50 text-amber-700 border-amber-200") :
                                    n.category === "신제품"  ? (isDark ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : "bg-emerald-50 text-emerald-700 border-emerald-200") :
                                    n.category === "재무"    ? (isDark ? "bg-cyan-900/40 text-cyan-300 border-cyan-700/50"      : "bg-cyan-50 text-cyan-700 border-cyan-200") :
                                                               (isDark ? "bg-slate-700 text-slate-400 border-slate-600"         : "bg-slate-100 text-slate-500 border-slate-200")
                                  }`}>
                                    {n.category}
                                  </span>
                                )}
                                <a
                                  href={n.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-sm font-medium hover:underline truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}
                                >
                                  {n.title}
                                </a>
                              </div>
                              {n.summary && (
                                <p className={`text-xs leading-relaxed ml-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>{n.summary}</p>
                              )}
                              {n.date && (
                                <p className={`text-xs mt-0.5 font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>{n.date}</p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* DART 공시 자료 */}
                {selected.disclosures && selected.disclosures.length > 0 && (
                  <section className={card}>
                    <SectionHeader title="기업 공시 자료 (DART Disclosures)" badge="DART" isDark={isDark} />
                    <ul className="space-y-2">
                      {selected.disclosures.map((d, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <span className={`text-xs font-mono shrink-0 w-20 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{d.date}</span>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-sm hover:underline truncate ${isDark ? "text-blue-400" : "text-blue-700"}`}
                          >
                            {d.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* 참고 문헌 */}
                {selected.evidence && selected.evidence.length > 0 && (
                  <section className={card}>
                    <SectionHeader title="자료 출처 (References)" isDark={isDark} />
                    <ul className="space-y-2">
                      {selected.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className={`text-xs mt-0.5 font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>[{i + 1}]</span>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-sm hover:underline truncate block ${isDark ? "text-blue-400" : "text-blue-700"}`}
                          >
                            {e.title || e.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ── 플로팅 채팅 버튼 ──────────────────────────────────────── */}
    <button
      ref={chatBtnRef}
      onClick={() => {
        if (!chatOpen) setChatMessages([]);
        setChatOpen((o) => !o);
      }}
      title={chatOpen ? "채팅 닫기" : "AI와 채팅"}
      className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${
        chatOpen
          ? isDark ? "bg-slate-600 hover:bg-slate-500 text-white" : "bg-slate-500 hover:bg-slate-400 text-white"
          : isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 hover:bg-slate-700 text-white"
      }`}
    >
      {chatOpen ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )}
    </button>

    {/* ── 신뢰도 모달 ─────────────────────────────────────────────── */}
    {reliabilityOpen && selected && (
      <ReliabilityModal analysis={selected} isDark={isDark} onClose={() => setReliabilityOpen(false)} />
    )}

    {/* ── 채팅 패널 ──────────────────────────────────────────────── */}
    {chatOpen && (
      <div
        ref={chatPanelRef}
        className={`fixed bottom-24 right-6 z-50 w-96 h-[520px] flex flex-col rounded-lg border shadow-2xl overflow-hidden ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-300"
        }`}
      >
        {/* 헤더 */}
        <div className={`shrink-0 border-b ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${chatLoading ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className={`text-sm font-semibold truncate max-w-[180px] ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                {selected ? `${selected.companyName} 어시스턴트` : "기업 분석 AI"}
              </span>
            </div>
            <button
              onClick={() => { if (confirm("대화를 초기화하시겠습니까?")) setChatMessages([]); }}
              className={`text-xs px-2 py-0.5 rounded border transition-colors shrink-0 ${isDark ? "border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-600" : "border-slate-300 text-slate-400 hover:text-red-500 hover:border-red-400"}`}
            >
              초기화
            </button>
          </div>
          {/* 모델 선택 */}
          <div className={`px-3 pb-2.5`}>
            <select
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              disabled={chatLoading}
              className={`w-full text-xs px-2 py-1.5 border rounded appearance-none focus:outline-none ${isDark ? "bg-slate-900 border-slate-600 text-slate-300" : "bg-white border-slate-300 text-slate-700"}`}
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: "no-repeat", backgroundPosition: "right .5rem top 50%", backgroundSize: ".55rem auto" }}
            >
              <option value={DEFAULT_FREE_MODEL_ID}>Gemini (기본)</option>
              {cloudAiModels.length > 0 && (
                <optgroup label="Cloud">
                  {cloudAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
              {localAiModels.length > 0 && (
                <optgroup label="Local">
                  {localAiModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {chatMessages.length === 0 && (
            <div className={`text-center text-xs mt-8 leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {selected
                ? `${selected.companyName}에 대해 궁금한 점을 물어보세요.\n인재상, 재무, 문화 등을 분석해 드립니다.`
                : "좌측에서 기업을 선택하면 해당 기업의\n분석 데이터를 바탕으로 답변합니다."}
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[82%] text-sm px-3 py-2 rounded-2xl leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === "user"
                    ? isDark ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-800 text-white rounded-br-sm"
                    : isDark ? "bg-slate-700 text-slate-200 rounded-bl-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}
              >
                {msg.content !== "" ? msg.content : (
                  <span className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 입력창 */}
        <div className={`shrink-0 border-t px-3 py-3 ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
          <div className={`flex items-end gap-2 border rounded-xl px-3 py-2 ${isDark ? "bg-slate-900 border-slate-600 focus-within:border-blue-500" : "bg-white border-slate-300 focus-within:border-slate-500"}`}>
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => {
                setChatInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder="메시지 입력… (Shift+Enter 줄바꿈)"
              disabled={chatLoading}
              rows={1}
              className={`flex-1 text-sm bg-transparent focus:outline-none resize-none overflow-hidden leading-relaxed ${isDark ? "text-slate-200 placeholder-slate-500" : "text-slate-800 placeholder-slate-400"}`}
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />
            <button
              onClick={sendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
            >
              <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
