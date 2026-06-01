"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  enqueueSpecAnalysis,
  streamSpecAnalysis,
  getSpecAnalyses,
  listCoverLetters,
  type CoverLetter,
  type CoverLetterJobAnalysis,
  type JobCategory,
  type JobCategoryTarget,
} from "@/lib/api/recruit/cover-letter";
import { MODELS } from "../_constants";

const SOURCE_FILTERS = [
  { value: "", label: "전체" },
  { value: "catch", label: "캐치" },
  { value: "linkareer", label: "링커리어" },
] as const;

const COMPANY_TYPE_FILTERS = ["", "대기업", "중견기업", "중소기업", "금융권"] as const;
const TARGET_FILTERS: { value: JobCategoryTarget; label: string }[] = [
  { value: "IT+전자", label: "IT+전자" },
  { value: "all", label: "전체" },
  { value: "IT", label: "IT" },
  { value: "전자", label: "전자" },
  { value: "영업", label: "영업" },
  { value: "경영/기획", label: "경영/기획" },
  { value: "마케팅", label: "마케팅" },
  { value: "인사/총무", label: "인사/총무" },
  { value: "재무/회계", label: "재무/회계" },
  { value: "생산/제조", label: "생산/제조" },
  { value: "기타", label: "기타" },
];

type TargetFilter = JobCategoryTarget;

function specChips(spec: CoverLetterJobAnalysis["extractedSpec"]) {
  return [
    spec.school,
    spec.major,
    spec.gpa,
    ...(spec.languages ?? []),
    ...(spec.certificates ?? []),
    ...(spec.internships ?? []),
    ...(spec.activities ?? []),
    ...(spec.awards ?? []),
    ...(spec.skills ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

const RADAR_LABELS = ["학점", "토익", "토익스피킹", "OPIC", "외국어(기타)", "자격증", "해외경험", "인턴", "수상내역", "교내/사회/봉사"] as const;

type SpecMetric = {
  label: typeof RADAR_LABELS[number];
  value: string;
  sub: string;
  score: number;
};

function categoryTone(category: CoverLetterJobAnalysis["jobCategory"], isDark: boolean) {
  switch (category) {
    case "IT":        return isDark ? "bg-indigo-500/20 text-indigo-200"  : "bg-indigo-50 text-indigo-700";
    case "전자":      return isDark ? "bg-amber-500/20 text-amber-200"    : "bg-amber-50 text-amber-700";
    case "영업":      return isDark ? "bg-emerald-500/20 text-emerald-200": "bg-emerald-50 text-emerald-700";
    case "경영/기획": return isDark ? "bg-blue-500/20 text-blue-200"      : "bg-blue-50 text-blue-700";
    case "마케팅":    return isDark ? "bg-pink-500/20 text-pink-200"      : "bg-pink-50 text-pink-700";
    case "인사/총무": return isDark ? "bg-purple-500/20 text-purple-200"  : "bg-purple-50 text-purple-700";
    case "재무/회계": return isDark ? "bg-teal-500/20 text-teal-200"      : "bg-teal-50 text-teal-700";
    case "생산/제조": return isDark ? "bg-orange-500/20 text-orange-200"  : "bg-orange-50 text-orange-700";
    default:          return isDark ? "bg-white/10 text-white/60"         : "bg-slate-100 text-slate-600";
  }
}

type CategoryAvg = {
  category: JobCategory;
  count: number;
  metrics: SpecMetric[];
  specIndex: number;
  chips: string[];
  summary: string;
};

type AnalyzedCoverLetter = {
  item: CoverLetter;
  analysis: CoverLetterJobAnalysis;
};

function extractGpaNum(gpa?: string): number | null {
  const m = (gpa ?? "").match(/(\d+(?:\.\d+)?)/);
  const v = m ? Number(m[1]) : null;
  return v !== null && v >= 1 && v <= 5 ? v : null;
}

function extractToeicNum(languages?: string[]): number | null {
  const val = (languages ?? []).find((l) => /토익|toeic(?!\s*s)/i.test(l));
  if (!val) return null;
  const m = val.match(/(\d{3})/);
  return m ? Number(m[1]) : null;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function stripLanguageLabel(value: string, pattern: RegExp) {
  return value.replace(pattern, "").replace(/^[\s:：-]+/, "").trim() || value;
}

function formatAverage(value: number, suffix = "개") {
  if (!value) return "-";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

function topFrequentChips(items: CoverLetterJobAnalysis[], limit = 22) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const raw of specChips(item.extractedSpec)) {
      const chip = raw.trim().replace(/\s+/g, " ");
      if (!chip || chip.length > 40) continue;
      counts.set(chip, (counts.get(chip) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([chip]) => chip);
}

function buildAverageMetrics(items: CoverLetterJobAnalysis[]): SpecMetric[] {
  const specs = items.map((item) => item.extractedSpec);
  const gpaNums = specs.map((spec) => extractGpaNum(spec.gpa)).filter((v): v is number => v !== null);
  const toeicNums = specs.map((spec) => extractToeicNum(spec.languages)).filter((v): v is number => v !== null);
  const toeicSpeaking = mostFrequent(specs.map((spec) => firstMatching(spec.languages, /토익\s*스피킹|toeic\s*speaking|토스|tos/i)).filter(Boolean));
  const opic = mostFrequent(specs.map((spec) => firstMatching(spec.languages, /opic|오픽/i)).filter(Boolean));
  const otherLanguageCounts = specs.map((spec) => (spec.languages ?? []).filter((value) => !/토익|toeic|토익\s*스피킹|toeic\s*speaking|토스|tos|opic|오픽/i.test(value)).length);
  const certCounts = specs.map((spec) => spec.certificates?.length ?? 0);
  const internshipCounts = specs.map((spec) => spec.internships?.length ?? 0);
  const awardCounts = specs.map((spec) => spec.awards?.length ?? 0);
  const overseasCounts = specs.map((spec) => countMatching([...(spec.activities ?? []), ...(spec.languages ?? [])], /해외|연수|교환|유학|글로벌|일본|미국|중국|영어권/i));
  const serviceCounts = specs.map((spec) => countMatching(spec.activities, /봉사|동아리|학생회|서포터즈|대외활동|교육|멘토|교내|사회/i));
  const gpaAvg = avg(gpaNums);
  const toeicAvg = avg(toeicNums);
  const otherLanguageAvg = avg(otherLanguageCounts);
  const certAvg = avg(certCounts);
  const internshipAvg = avg(internshipCounts);
  const awardAvg = avg(awardCounts);
  const overseasAvg = avg(overseasCounts);
  const serviceAvg = avg(serviceCounts);

  return [
    { label: "학점", value: gpaAvg ? `${gpaAvg.toFixed(2)}/4.5` : "-", sub: "학점", score: gpaAvg ? Math.min(100, (gpaAvg / 4.5) * 100) : 0 },
    { label: "토익", value: toeicAvg ? `${Math.round(toeicAvg)}점` : "-", sub: "토익", score: toeicAvg ? Math.min(100, (toeicAvg / 990) * 100) : 0 },
    {
      label: "토익스피킹",
      value: toeicSpeaking ? stripLanguageLabel(toeicSpeaking, /토익\s*스피킹|toeic\s*speaking|토스|tos/ig) : "-",
      sub: "토익스피킹",
      score: levelScore(toeicSpeaking, { AL: 100, IH: 88, IM3: 72, IM2: 60, IM1: 48, IL: 35, LV8: 100, LV7: 88, LV6: 72, LV5: 55, LV4: 38 }),
    },
    {
      label: "OPIC",
      value: opic ? stripLanguageLabel(opic, /opic|오픽/ig) : "-",
      sub: "OPIC",
      score: levelScore(opic, { AL: 100, IH: 88, IM3: 72, IM2: 60, IM1: 48, IL: 35, NH: 20 }),
    },
    { label: "외국어(기타)", value: formatAverage(otherLanguageAvg), sub: "외국어(기타)", score: Math.min(100, otherLanguageAvg * 35) },
    { label: "자격증", value: formatAverage(certAvg), sub: "자격증", score: Math.min(100, certAvg * 35) },
    { label: "해외경험", value: formatAverage(overseasAvg, "회"), sub: "해외경험", score: Math.min(100, overseasAvg * 45) },
    { label: "인턴", value: formatAverage(internshipAvg), sub: "인턴", score: Math.min(100, internshipAvg * 45) },
    { label: "수상내역", value: formatAverage(awardAvg), sub: "수상내역", score: Math.min(100, awardAvg * 35) },
    { label: "교내/사회/봉사", value: formatAverage(serviceAvg), sub: "교내/사회/봉사", score: Math.min(100, serviceAvg * 28) },
  ];
}

function buildCategoryAverages(analyses: Record<string, CoverLetterJobAnalysis>): CategoryAvg[] {
  const groups = new Map<JobCategory, CoverLetterJobAnalysis[]>();
  for (const a of Object.values(analyses)) {
    const cat = a.jobCategory as JobCategory;
    groups.set(cat, [...(groups.get(cat) ?? []), a]);
  }
  return Array.from(groups.entries())
    .map(([category, items]) => {
      const metrics = buildAverageMetrics(items);
      const chips = topFrequentChips(items);
      const summary = chips.slice(0, 9).join(" / ");
      return {
        category,
        count: items.length,
        metrics,
        specIndex: buildSpecIndex(metrics),
        chips,
        summary,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function firstMatching(values: string[] = [], pattern: RegExp) {
  return values.find((value) => pattern.test(value)) ?? "";
}

function countMatching(values: string[] = [], pattern: RegExp) {
  return values.filter((value) => pattern.test(value)).length;
}

function levelScore(value: string, table: Record<string, number>) {
  const normalized = value.toUpperCase().replace(/\s+/g, "");
  const key = Object.keys(table).find((item) => normalized.includes(item));
  return key ? table[key] : value ? 45 : 0;
}

function buildSpecIndex(metrics: SpecMetric[]) {
  const average = metrics.reduce((sum, metric) => sum + metric.score, 0) / Math.max(metrics.length, 1);
  return Math.round(average * 10);
}

function RadarChart({ metrics, isDark }: { metrics: SpecMetric[]; isDark: boolean }) {
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
        <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-blue-500" />
        합격자
      </div>
    </div>
  );
}

export default function RecruitSpecPage() {
  const router = useRouter();
  const { theme, uiStyle } = useTheme();
  const isDark = theme === "dark";
  const isGlass = uiStyle === "glass";

  const [items, setItems] = useState<CoverLetter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [companyType, setCompanyType] = useState("");

  const [model, setModel] = useState(MODELS[0]?.id ?? "");

  const [analyses, setAnalyses] = useState<Record<string, CoverLetterJobAnalysis>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLog, setAnalysisLog] = useState<string>("");
  const [analyzedModel, setAnalyzedModel] = useState("");
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [selectedAverageCategory, setSelectedAverageCategory] = useState<JobCategory | null>(null);
  const [target, setTarget] = useState<TargetFilter>("IT+전자");
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pageClass = isGlass ? "bg-transparent" : isDark ? "bg-slate-950" : "bg-slate-50";
  const panelClass = isGlass ? "glass-panel border-white/20" : isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white";
  const inputClass = isDark
    ? "border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400/50"
    : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-indigo-300";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const textSub = isDark ? "text-white/50" : "text-slate-500";

  const categoryAverages = useMemo(() => buildCategoryAverages(analyses), [analyses]);
  const selectedAverage = useMemo(() => {
    if (categoryAverages.length === 0) return null;
    return categoryAverages.find((row) => row.category === selectedAverageCategory) ?? categoryAverages[0];
  }, [categoryAverages, selectedAverageCategory]);
  const selectedCategoryItems = useMemo<AnalyzedCoverLetter[]>(() => {
    if (!selectedAverage) return [];
    return items
      .map((item) => ({ item, analysis: analyses[item.id] }))
      .filter((entry): entry is AnalyzedCoverLetter => Boolean(entry.analysis))
      .filter(({ analysis }) => analysis.jobCategory === selectedAverage.category);
  }, [analyses, items, selectedAverage]);
  const selectedDetail = useMemo(
    () => selectedCategoryItems.find(({ item }) => item.id === selectedDetailId) ?? null,
    [selectedCategoryItems, selectedDetailId],
  );

  const MAX_SELECT = 20;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      return next;
    });
  const selectN = (n: number) =>
    setSelectedIds(
      new Set(items.filter((item) => !analyses[item.id]).slice(0, n).map((item) => item.id)),
    );
  const selectUnanalyzed = () =>
    setSelectedIds(new Set(items.filter((item) => !analyses[item.id]).slice(0, MAX_SELECT).map((item) => item.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const PAGE_SIZE = 20;

  const load = async (p = 1, reset = true) => {
    setLoading(true);
    if (reset) setError(null);
    try {
      const res = await listCoverLetters(p, PAGE_SIZE, {
        source: source || undefined,
        companyType: companyType || undefined,
        search: search.trim() || undefined,
        sort: "latest",
      });
      setTotal(res.total);
      setHasMore(res.hasNext ?? false);
      setPage(p);
      if (reset) {
        setItems(res.items);
        setSelectedIds(new Set());
        setAnalysisError(null);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
        });
      }
      // DB에 저장된 분석 결과 로드
      const saved = await getSpecAnalyses(res.items.map((i) => i.id));
      if (saved.length > 0) {
        const savedIds = new Set(saved.map((s) => s.id));
        setAnalyses((prev) => {
          const next = { ...prev };
          for (const item of saved) next[item.id] = item;
          return next;
        });
        // 이미 분석된 항목은 선택에서 제거
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of savedIds) next.delete(id);
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "자소서 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => load(page + 1, false);

  useEffect(() => {
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, companyType]);

  const runAnalysis = async () => {
    const targetIds = selectedIds.size > 0
      ? [...selectedIds]
      : items.filter((item) => !analyses[item.id]).slice(0, 20).map((item) => item.id);
    if (targetIds.length === 0 || analyzing) return;

    analysisAbortRef.current?.abort();
    const ctrl = new AbortController();
    analysisAbortRef.current = ctrl;

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisLog("");
    try {
      const { jobId } = await enqueueSpecAnalysis({
        ids: targetIds,
        target,
        model,
        limit: targetIds.length,
      });
      await streamSpecAnalysis(
        jobId,
        (event) => {
          if (event.type === "log") {
            setAnalysisLog(event.message);
          } else if (event.type === "done" && event.payload) {
            const res = event.payload;
            setAnalyses((prev) => {
              const next = { ...prev };
              for (const item of res.items) next[item.id] = item;
              return next;
            });
            setAnalyzedModel(res.model);
            setAnalysisLog("");
          } else if (event.type === "error") {
            setAnalysisError(event.message);
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setAnalysisError(e instanceof Error ? e.message : "AI 스펙 분석에 실패했습니다.");
      }
    } finally {
      setAnalyzing(false);
      setAnalysisLog("");
    }
  };

  useEffect(() => {
    if (categoryAverages.length === 0) {
      if (selectedAverageCategory) setSelectedAverageCategory(null);
      return;
    }
    if (!selectedAverageCategory || !categoryAverages.some((row) => row.category === selectedAverageCategory)) {
      setSelectedAverageCategory(categoryAverages[0].category);
      setSelectedDetailId(null);
    }
  }, [categoryAverages, selectedAverageCategory]);

  return (
    <main className={`h-full overflow-y-auto ${pageClass}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className={`rounded-2xl border p-5 shadow-sm ${panelClass}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <button
                onClick={() => router.push("/recruit")}
                className={`mb-3 inline-flex items-center text-sm font-semibold ${isDark ? "text-white/45 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
              >
                ← 채용
              </button>
              <h1 className={`text-3xl font-bold tracking-tight ${textMain}`}>스펙 분석</h1>
              <p className={`mt-2 text-sm ${textSub}`}>
                합격 자소서에서 학력, 학점, 어학, 자격증, 인턴, 활동 이력을 추출해 한눈에 비교합니다.
              </p>
            </div>

            <div className={`flex w-full overflow-hidden rounded-xl border ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className={`flex-1 min-w-[110px] border-0 px-3 py-2 text-xs font-semibold outline-none ${isDark ? "bg-transparent text-white" : "bg-transparent text-slate-700"}`}
                title="AI 모델 선택"
              >
                {MODELS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <button
                onClick={runAnalysis}
                disabled={analyzing || loading || items.length === 0}
                className="flex-[1.2] inline-flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
              >
                {analyzing && <span className="h-3 w-3 rounded-full border-2 border-white/35 border-t-white animate-spin" />}
                {selectedIds.size > 0 ? `선택 ${selectedIds.size}건 분석` : "AI 스펙 분석"}
              </button>
            </div>
          </div>          {/* 필터 래퍼: 검색/드롭다운 영역과 직무 칩 영역을 깔끔한 2열 행으로 재구성하여 태블릿/모바일 깨짐 방지 */}
          <div className="mt-5 flex flex-col gap-3.5">
            {/* 상단 행: 검색 인풋 & 드롭다운 필터들 */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {/* 검색 인풋 & 조회 버튼 */}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  load(1, true);
                }}
                className="flex gap-2 lg:flex-1"
              >
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="기업명, 직무, 시즌 검색"
                  className={`h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none transition-colors ${inputClass}`}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className={`h-10 rounded-lg px-4 text-xs font-bold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                    isDark ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  조회
                </button>
              </form>

              {/* 드롭다운 필터들 */}
              <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center">
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  className={`h-10 rounded-lg border px-3 text-xs font-semibold outline-none lg:w-36 ${inputClass}`}
                >
                  {SOURCE_FILTERS.map((item) => (
                    <option key={item.value || "all"} value={item.value} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-800"}>{item.label}</option>
                  ))}
                </select>
                <select
                  value={companyType}
                  onChange={(event) => setCompanyType(event.target.value)}
                  className={`h-10 rounded-lg border px-3 text-xs font-semibold outline-none lg:w-40 ${inputClass}`}
                >
                  {COMPANY_TYPE_FILTERS.map((item) => (
                    <option key={item || "all"} value={item} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-800"}>{item || "기업분류 전체"}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 하단 행: 직무 타겟 칩 탭 (가로 너비 제약 없이 모바일/태블릿에서도 미려하게 스크롤 가능) */}
            <div className={`border-t pt-3 ${isDark ? "border-white/5" : "border-slate-100"}`}>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                {TARGET_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTarget(item.value)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      target === item.value
                        ? "bg-indigo-600 text-white border border-indigo-600"
                        : isDark
                          ? "text-white/50 border border-transparent hover:text-white hover:bg-white/5"
                          : "text-slate-500 border border-transparent hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`mt-4 flex flex-wrap items-center gap-2 text-xs ${textSub}`}>
            <span>조회 {items.length.toLocaleString()}건 / 전체 {total.toLocaleString()}건</span>
            {analyzedModel && <span>· 분석 모델 {analyzedModel}</span>}
            {analysisLog && (
              <span className={`flex items-center gap-1.5 ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {analysisLog}
              </span>
            )}
            {analysisError && <span className={isDark ? "text-red-300" : "text-red-500"}>{analysisError}</span>}
            {error && <span className={isDark ? "text-red-300" : "text-red-500"}>{error}</span>}
          </div>
        </section>

        {/* 커버레터 선택 패널 */}
        {items.length > 0 && !loading && (
          <section className={`rounded-2xl border p-4 shadow-sm ${panelClass}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className={`text-sm font-bold ${textMain}`}>자소서 선택</h2>
                <span className={`text-xs ${textSub}`}>
                  미분석 {items.filter((i) => !analyses[i.id]).length}건 · 분석됨 {Object.keys(analyses).length}건 (숨김)
                </span>
                {selectedIds.size > 0 && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600 border border-indigo-100">
                    {selectedIds.size}개 선택
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={selectUnanalyzed}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  미분석만
                </button>
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => selectN(n)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      selectedIds.size === n
                        ? isDark ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-200" : "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {n}개
                  </button>
                ))}
                {selectedIds.size > 0 && (
                  <button
                    onClick={clearSelection}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    해제
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {items.filter((item) => !analyses[item.id]).map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleSelect(item.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? isDark ? "border-indigo-400/40 bg-indigo-500/15" : "border-indigo-200 bg-indigo-50"
                          : isDark ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-slate-100 bg-slate-50 hover:bg-white"
                      }`}
                    >
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected ? "border-indigo-600 bg-indigo-600" : isDark ? "border-white/30" : "border-slate-300"
                      }`}>
                        {isSelected && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="text-white">
                            <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-bold ${textMain}`}>{item.company}</p>
                        <p className={`truncate text-[11px] ${textSub}`}>{item.position}</p>
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold ${isDark ? "bg-white/10 text-white/40" : "bg-slate-100 text-slate-400"}`}>
                        미분석
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {hasMore && (
              <div className="mt-3 flex items-center justify-between">
                <span className={`text-xs ${textSub}`}>{items.length.toLocaleString()}건 표시 중 / 전체 {total.toLocaleString()}건</span>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    isDark ? "border-white/10 text-white/60 hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" /> : null}
                  더 불러오기 ({total - items.length}건 남음)
                </button>
              </div>
            )}
          </section>
        )}

        <section className={`min-h-[28rem] rounded-2xl border p-5 shadow-sm ${panelClass}`}>
          {loading ? (
            <div className={`flex h-80 items-center justify-center text-sm ${textSub}`}>자소서 데이터를 불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className={`flex h-80 items-center justify-center text-sm ${textSub}`}>분석할 데이터가 없습니다.</div>
          ) : Object.keys(analyses).length === 0 ? (
            <div className={`flex h-80 flex-col items-center justify-center gap-3 text-sm ${textSub}`}>
              <span>자소서를 선택하고 AI 스펙 분석을 실행하세요.</span>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {selectedIds.size > 0 ? `선택 ${selectedIds.size}건 분석` : "AI 스펙 분석 (미분석 상위 20건)"}
              </button>
            </div>
          ) : categoryAverages.length === 0 || !selectedAverage ? (
            <div className={`flex h-80 items-center justify-center text-sm ${textSub}`}>아직 평균 스펙을 만들 분석 결과가 없습니다.</div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1fr_21rem]">
              <article className={`rounded-2xl border p-5 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
                <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-full border px-4 py-1.5 text-sm font-black ${isDark ? "border-blue-400/40 bg-blue-500/10 text-blue-200" : "border-blue-300 bg-blue-50 text-blue-500"}`}>
                        평균 스펙
                      </span>
                      <h2 className={`text-xl sm:text-3xl font-black tracking-tight ${isDark ? "text-blue-300" : "text-blue-500"}`}>
                        {selectedAverage.category}
                      </h2>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${categoryTone(selectedAverage.category, isDark)}`}>
                        {selectedAverage.count}건
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className={`text-xl sm:text-3xl font-black ${textMain}`}>{selectedAverage.category} 합격자 평균</p>
                        <p className={`mt-3 max-w-3xl text-xs sm:text-sm font-semibold leading-relaxed ${textSub}`}>
                          {selectedAverage.summary || "아직 평균 요약에 사용할 스펙 항목이 충분하지 않습니다."}
                        </p>
                      </div>
                      <button
                        onClick={() => setTarget(selectedAverage.category as TargetFilter)}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${isDark ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        분석 대상 지정
                      </button>
                    </div>

                    <div className={`mt-8 grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                      {selectedAverage.metrics.map((metric) => (
                        <div
                          key={`${selectedAverage.category}-${metric.label}`}
                          className={`flex min-h-[5.5rem] sm:min-h-32 w-full flex-col items-center justify-center overflow-hidden border-b border-r p-1.5 sm:p-2 text-center last:border-r-0 ${isDark ? "border-white/10" : "border-slate-200"}`}
                        >
                          <span className={`w-full overflow-hidden text-ellipsis whitespace-nowrap font-black tracking-tight ${textMain} ${
                            metric.value.length > 7 ? "text-[11px] sm:text-base" : metric.value.length > 5 ? "text-xs sm:text-xl" : metric.value.length > 3 ? "text-sm sm:text-2xl" : "text-lg sm:text-4xl"
                          }`}>
                            {metric.value}
                          </span>
                          <span className={`mt-1.5 text-[10px] sm:text-xs font-bold ${isDark ? "text-white/55" : "text-slate-500"}`}>{metric.sub}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-1.5">
                      {selectedAverage.chips.length === 0 ? (
                        <span className={`text-xs ${textSub}`}>추출된 대표 스펙 키워드가 없습니다.</span>
                      ) : (
                        selectedAverage.chips.map((chip, index) => (
                          <span key={`${selectedAverage.category}-${chip}-${index}`} className={`rounded-full border px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold ${isDark ? "border-white/10 bg-white/5 text-white/60" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {chip}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center">
                    <div className="text-center">
                      <p className={`text-xs sm:text-sm font-black ${textSub}`}>평균 스펙지수</p>
                      <p className={`text-4xl sm:text-7xl font-black leading-none ${isDark ? "text-blue-300" : "text-blue-500"}`}>{selectedAverage.specIndex}</p>
                    </div>
                    <RadarChart metrics={selectedAverage.metrics} isDark={isDark} />
                  </div>
                </div>

                <div className={`mt-6 rounded-2xl border p-4 ${isDark ? "border-white/10 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className={`text-base font-black ${textMain}`}>세부정보</h3>
                      <p className={`mt-0.5 text-xs ${textSub}`}>
                        {selectedAverage.category}로 분류된 합격 자소서 {selectedCategoryItems.length}건
                      </p>
                    </div>
                    {selectedDetail && (
                      <button
                        onClick={() => setSelectedDetailId(null)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${isDark ? "bg-white/10 text-white/60 hover:bg-white/15" : "bg-white text-slate-500 hover:bg-slate-100"}`}
                      >
                        접기
                      </button>
                    )}
                  </div>

                  {selectedCategoryItems.length === 0 ? (
                    <p className={`rounded-xl border px-3 py-4 text-sm ${isDark ? "border-white/10 text-white/45" : "border-slate-200 text-slate-500"}`}>
                      이 카테고리에 표시할 세부 항목이 없습니다.
                    </p>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {selectedCategoryItems.map(({ item, analysis }) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedDetailId((prev) => prev === item.id ? null : item.id)}
                            className={`w-full rounded-xl border p-3 text-left transition-colors ${
                              selectedDetail?.item.id === item.id
                                ? isDark ? "border-blue-400/40 bg-blue-500/15" : "border-blue-200 bg-white"
                                : isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className={`min-w-0 truncate text-sm font-black ${textMain}`}>{item.company || "기업명 없음"}</p>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${categoryTone(analysis.jobCategory, isDark)}`}>
                                {Math.round(analysis.confidence * 100)}%
                              </span>
                            </div>
                            <p className={`mt-1 truncate text-xs font-semibold ${textSub}`}>{item.position || "직무 없음"}</p>
                            <p className={`mt-2 line-clamp-2 text-xs leading-relaxed ${isDark ? "text-white/60" : "text-slate-600"}`}>
                              {analysis.extractedSpec.summary || item.spec || "추출된 스펙 요약이 없습니다."}
                            </p>
                          </button>
                        ))}
                      </div>

                      <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-white"}`}>
                        {!selectedDetail ? (
                          <div className={`flex h-full min-h-64 items-center justify-center text-center text-sm leading-relaxed ${textSub}`}>
                            왼쪽 항목을 선택하면<br />추출 스펙과 분류 사유를 확인할 수 있습니다.
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`truncate text-lg font-black ${textMain}`}>{selectedDetail.item.company || "기업명 없음"}</p>
                                <p className={`mt-1 text-sm font-semibold ${textSub}`}>{selectedDetail.item.position || "직무 없음"}</p>
                                {selectedDetail.item.season && (
                                  <p className={`mt-0.5 text-xs ${textSub}`}>{selectedDetail.item.season}</p>
                                )}
                              </div>
                              <button
                                onClick={() => router.push(`/recruit/cover-letter?cover=${encodeURIComponent(selectedDetail.item.id)}`)}
                                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${isDark ? "bg-blue-500/20 text-blue-200 hover:bg-blue-500/30" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                              >
                                자소서 보기
                              </button>
                            </div>

                            <div className="mt-4 space-y-3">
                              <div>
                                <p className={`mb-1 text-xs font-black ${textSub}`}>추출 스펙</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {specChips(selectedDetail.analysis.extractedSpec).length === 0 ? (
                                    <span className={`text-xs ${textSub}`}>추출된 스펙 항목이 없습니다.</span>
                                  ) : (
                                    specChips(selectedDetail.analysis.extractedSpec).slice(0, 18).map((chip, index) => (
                                      <span key={`${selectedDetail.item.id}-${chip}-${index}`} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${isDark ? "border-white/10 bg-white/5 text-white/60" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                        {chip}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>

                              <div>
                                <p className={`mb-1 text-xs font-black ${textSub}`}>분류 사유</p>
                                <p className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${isDark ? "bg-white/5 text-white/65" : "bg-slate-50 text-slate-600"}`}>
                                  {selectedDetail.analysis.reason || "분류 사유가 없습니다."}
                                </p>
                              </div>

                              {selectedDetail.item.spec && (
                                <div>
                                  <p className={`mb-1 text-xs font-black ${textSub}`}>원본 스펙</p>
                                  <p className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${isDark ? "bg-white/5 text-white/65" : "bg-slate-50 text-slate-600"}`}>
                                    {selectedDetail.item.spec}
                                  </p>
                                </div>
                              )}

                              <div className={`grid grid-cols-2 gap-2 text-xs ${textSub}`}>
                                <div className={`rounded-lg px-3 py-2 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                                  문항 {selectedDetail.item.questions.length}개
                                </div>
                                <div className={`rounded-lg px-3 py-2 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                                  조회 {selectedDetail.item.viewCount?.toLocaleString() ?? "-"}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>

              <aside className={`rounded-2xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between px-1 pb-3">
                  <h2 className={`text-base font-black ${textMain}`}>카테고리 목록</h2>
                  <span className={`text-sm font-bold ${textSub}`}>{categoryAverages.length}개</span>
                </div>
                <div className="max-h-[42rem] space-y-2 overflow-y-auto pr-1">
                  {categoryAverages.map((row) => (
                    <button
                      key={row.category}
                      onClick={() => {
                        setSelectedAverageCategory(row.category);
                        setTarget(row.category as TargetFilter);
                        setSelectedDetailId(null);
                      }}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        selectedAverage.category === row.category
                          ? isDark ? "border-blue-400/40 bg-blue-500/15" : "border-blue-200 bg-blue-50"
                          : isDark ? "border-white/10 bg-slate-900/60 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`min-w-0 truncate text-lg font-black ${textMain}`}>{row.category}</p>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${categoryTone(row.category, isDark)}`}>
                          {row.count}건
                        </span>
                      </div>
                      <p className={`mt-1 text-xs font-bold ${textSub}`}>평균 스펙지수 {row.specIndex}</p>
                      <p className={`mt-3 line-clamp-3 text-sm leading-relaxed ${isDark ? "text-white/60" : "text-slate-600"}`}>
                        {row.summary || "요약할 스펙 항목이 부족합니다."}
                      </p>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
