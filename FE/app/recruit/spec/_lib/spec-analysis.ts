import type {
  CoverLetter,
  CoverLetterJobAnalysis,
  JobCategory,
  JobCategoryTarget,
} from "@/lib/api/recruit/cover-letter";

export const SOURCE_FILTERS = [
  { value: "", label: "전체" },
  { value: "catch", label: "캐치" },
  { value: "linkareer", label: "링커리어" },
] as const;

export const COMPANY_TYPE_FILTERS = ["", "대기업", "중견기업", "중소기업", "금융권"] as const;

export const TARGET_FILTERS: { value: JobCategoryTarget; label: string }[] = [
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

export type TargetFilter = JobCategoryTarget;

export const RADAR_LABELS = ["학점", "토익", "토익스피킹", "OPIC", "외국어(기타)", "자격증", "해외경험", "인턴", "수상내역", "교내/사회/봉사"] as const;

export type SpecMetric = {
  label: typeof RADAR_LABELS[number];
  value: string;
  sub: string;
  score: number;
};

export type CategoryAvg = {
  category: JobCategory;
  count: number;
  metrics: SpecMetric[];
  specIndex: number;
  chips: string[];
  summary: string;
};

export type AnalyzedCoverLetter = {
  item: CoverLetter;
  analysis: CoverLetterJobAnalysis;
};

export function specChips(spec: CoverLetterJobAnalysis["extractedSpec"]) {
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

export function categoryTone(category: CoverLetterJobAnalysis["jobCategory"], isDark: boolean) {
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

export function buildAverageMetrics(items: CoverLetterJobAnalysis[]): SpecMetric[] {
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

export function buildSpecIndex(metrics: SpecMetric[]) {
  const average = metrics.reduce((sum, metric) => sum + metric.score, 0) / Math.max(metrics.length, 1);
  return Math.round(average * 10);
}

export function buildCategoryAverages(analyses: Record<string, CoverLetterJobAnalysis>): CategoryAvg[] {
  const groups = new Map<JobCategory, CoverLetterJobAnalysis[]>();
  for (const analysis of Object.values(analyses)) {
    const category = analysis.jobCategory as JobCategory;
    groups.set(category, [...(groups.get(category) ?? []), analysis]);
  }
  return Array.from(groups.entries())
    .map(([category, items]) => {
      const metrics = buildAverageMetrics(items);
      const chips = topFrequentChips(items);
      return {
        category,
        count: items.length,
        metrics,
        specIndex: buildSpecIndex(metrics),
        chips,
        summary: chips.slice(0, 9).join(" / "),
      };
    })
    .sort((a, b) => b.count - a.count);
}
