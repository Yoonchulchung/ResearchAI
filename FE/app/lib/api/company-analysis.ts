import { apiFetch, API_BASE, tokenStore } from "./base";

export interface CompetencyScores {
  성취지향: number;
  도전정신: number;
  주도성: number;
  문제해결: number;
  의사소통: number;
  대인관계: number;
  열정: number;
  주인의식: number;
  팀워크: number;
  자원계획관리: number;
  치밀성: number;
  분석적사고: number;
  전문성: number;
}

export type CompetencyReasons = Partial<Record<keyof CompetencyScores, string>>;

export interface SwotAnalysis {
  S: string[];
  W: string[];
  O: string[];
  T: string[];
}

export interface Competitor {
  name: string;
  reason: string;
  needed: string;
  threatLevel: 'high' | 'medium' | 'low';
}

export interface BusinessSegment {
  name: string;
  revenueShare: string | null;
  description: string;
  subsidiaries: string[] | null;
  mainProducts: string | null;
  facilities: string | null;
  corporateCount: string | null;
}

export interface EmployeeDetail {
  year: number;
  total: number | null;
  regular: number | null;
  contract: number | null;
  avgTenure: string | null;
  avgSalary: string | null;
  maleCount: number | null;
  femaleCount: number | null;
  maleTenure: string | null;
  femaleTenure: string | null;
  maleSalary: string | null;
  femaleSalary: string | null;
}

export interface CompanyProfile {
  businessArea: string | null;
  businessStatus: string | null;
  coreValues: string[];
  jobIntroduction: { name: string; description: string }[] | null;
  specialNotes: string | null;
  historyAchievements: string | null;
  socialContribution: string | null;
  employeeCount: string | null;
  brandImage: string | null;
  businessPromotion: string | null;
  currentYearGoal: string | null;
  nextYearGoal: string | null;
}

export interface YearlyFinancial {
  year: number;
  revenue: number | null;
  revenueFormatted: string | null;
  operatingProfit: number | null;
  operatingProfitFormatted: string | null;
  netIncome: number | null;
  netIncomeFormatted: string | null;
  operatingMargin: number | null;
}

export interface CompanyAnalysis {
  id: string;
  companyKey: string;
  companyName: string;
  scores: CompetencyScores;
  reasons: CompetencyReasons | null;
  summary: string | null;
  evidence: { title: string; url: string }[] | null;
  aiModel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedFees: number | null;
  // AI 분석
  swot: SwotAnalysis | null;
  competitors: Competitor[] | null;
  businessSegments: BusinessSegment[] | null;
  segmentSources: { title: string; url: string }[] | null;
  companyProfile: CompanyProfile | null;
  industry: string | null;
  companySize: string | null;
  creditRating: string | null;
  report: string | null;
  // DART 기업 정보
  corpClass: string | null;
  stockCode: string | null;
  employees: string | null;
  employeeHistory: EmployeeDetail[] | null;
  capital: string | null;
  homeUrl: string | null;
  address: string | null;
  dartUrl: string | null;
  ceoName: string | null;
  foundedDate: string | null;
  fiscalYear: string | null;
  multiYearFinancials: YearlyFinancial[] | null;
  financialSummary: string | null;
  disclosures: { title: string; date: string; url: string }[] | null;
  // 웹 수집
  recentNews: { title: string; url: string; date: string; category?: string; summary?: string }[] | null;
  jobPostings: { title: string; url: string; date: string }[] | null;
  jobplanetSummary: string | null;
  missionVision: { mission: string | null; vision: string | null; coreValues: string[]; talentProfile: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export type AnalyzeProgressEvent =
  | { type: "log"; message: string }
  | { type: "searching" }
  | { type: "scoring" }
  | { type: "done"; result: CompanyAnalysis }
  | { type: "error"; message: string };

export const listCompanyAnalyses = () =>
  apiFetch<CompanyAnalysis[]>("/company-analysis");

export const getCompanyAnalysis = (companyKey: string) =>
  apiFetch<CompanyAnalysis>(`/company-analysis/${encodeURIComponent(companyKey)}`);

export const deleteCompanyAnalysis = (companyKey: string) =>
  apiFetch<{ ok: boolean }>(`/company-analysis/${encodeURIComponent(companyKey)}`, {
    method: "DELETE",
  });

/** AI Agent 분석 SSE 스트림 — onEvent 콜백으로 진행 상황 전달 */
export async function analyzeCompanyStream(
  companyName: string,
  aiModel: string | undefined,
  onEvent: (event: AnalyzeProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = tokenStore.get();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (typeof window !== "undefined") {
    let anonId = localStorage.getItem("anon_id");
    if (!anonId) {
      anonId = crypto.randomUUID();
      localStorage.setItem("anon_id", anonId);
    }
    headers["X-Anon-Id"] = anonId;
  }

  const res = await fetch(`${API_BASE}/company-analysis/analyze`, {
    method: "POST",
    headers,
    body: JSON.stringify({ companyName, aiModel }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`분석 요청 실패: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as AnalyzeProgressEvent;
        onEvent(event);
      } catch {}
    }
  }
}
