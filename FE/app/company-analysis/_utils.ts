import type { CompanyAnalysis, AnalyzeProgressEvent } from "@/lib/api/company-analysis";

export function normalizeCompanyKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

export function estimateAnalysisProgress(event: AnalyzeProgressEvent, current: number) {
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

export function getAnalysisStepLabel(event: AnalyzeProgressEvent, fallback: string) {
  if (event.type === "done") return "완료";
  if (event.type === "error") return "오류";
  if (event.type === "searching") return "외부 데이터 수집";
  if (event.type === "scoring") return "AI 병렬 분석";
  if (event.type !== "log" || !("message" in event) || !event.message) return fallback;

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

export function formatApartmentPrice(price: number | null | undefined) {
  if (!price) return null;
  const eok = price / 10000;
  return `${Number.isInteger(eok) ? eok.toFixed(0) : eok.toFixed(1)}억`;
}

export function formatApartmentPriceSummary(prices: CompanyAnalysis["apartmentPrices"]) {
  if (!prices) return null;
  const parts = [
    formatApartmentPrice(prices.avgDealPrice) ? `매매: ${formatApartmentPrice(prices.avgDealPrice)}` : null,
    formatApartmentPrice(prices.avgLeasePrice) ? `전세: ${formatApartmentPrice(prices.avgLeasePrice)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function cleanNewsTitle(title: string) {
  return title
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDisplayableNewsTitle(title: string, url: string) {
  const cleaned = cleanNewsTitle(title);
  if (cleaned.length < 8) return false;
  if (/^\[[^\]]*$/.test(cleaned)) return false;
  if (/[ÃìíêëûüE3]{2,}/.test(cleaned)) return false;
  if (/namu\.wiki|나무위키/i.test(`${cleaned} ${url}`)) return false;
  return true;
}

export interface ReliabilityCheck {
  label: string;
  ok: boolean;
  category: "official" | "web" | "ai";
}

export function computeReliability(a: CompanyAnalysis): { score: number; checks: ReliabilityCheck[]; categoryScores: Record<string, number> } {
  const checks: ReliabilityCheck[] = [
    { label: "DART 연결", ok: !!a.dartUrl, category: "official" },
    { label: "다년간 재무", ok: (a.multiYearFinancials?.length ?? 0) >= 2, category: "official" },
    { label: "공시 자료", ok: (a.disclosures?.length ?? 0) > 0, category: "official" },
    { label: "직원 정보", ok: !!(a.employees || a.employeeHistory?.length), category: "official" },
    { label: "최근 뉴스 5+", ok: (a.recentNews?.length ?? 0) >= 5, category: "web" },
    { label: "채용 공고", ok: (a.jobPostings?.length ?? 0) > 0, category: "web" },
    { label: "기업 리뷰", ok: !!a.jobplanetSummary, category: "web" },
    { label: "기업 프로필", ok: !!a.companyProfile, category: "web" },
    { label: "미션·비전", ok: !!(a.missionVision?.mission || a.missionVision?.vision), category: "web" },
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

export const RELIABILITY_META = {
  official: { label: "공식 데이터 (DART)", color: "#3b82f6", desc: "상장·재무·공시 정보" },
  web: { label: "웹 수집 데이터", color: "#22c55e", desc: "뉴스·공고·리뷰·프로필" },
  ai: { label: "AI 분석 품질", color: "#a855f7", desc: "근거·SWOT·경쟁사·사업부문" },
} as const;
