import { CompetencyScores } from './entity/company-analysis.entity';
import { YearlyFinancial, EmployeeDetail } from '../../infrastructure/documents/dart-financial.service';

export type { CompetencyScores };

export const COMPETENCY_KEYS = [
  '성취지향', '도전정신', '주도성', '문제해결', '의사소통',
  '대인관계', '열정', '주인의식', '팀워크', '자원계획관리',
  '치밀성', '분석적사고', '전문성',
] as const;

export const ZERO_SCORES: CompetencyScores = COMPETENCY_KEYS.reduce(
  (acc, k) => ({ ...acc, [k]: 0 }),
  {} as CompetencyScores,
);

export type CompetencyReasons = Partial<Record<typeof COMPETENCY_KEYS[number], string>>;

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
  siteUrl: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  marketScope?: 'domestic' | 'global_affects_domestic' | null;
}

export interface HrWheelArea {
  area: string;
  score: number;
  evidence: string;
}

export interface CompetingValues {
  clan: number;
  adhocracy: number;
  market: number;
  hierarchy: number;
  dominant: 'clan' | 'adhocracy' | 'market' | 'hierarchy';
  description: string;
  evidence?: {
    clan?: string;
    adhocracy?: string;
    market?: string;
    hierarchy?: string;
  } | null;
}

export interface UlrichModel {
  strategicPartner: number;
  changeAgent: number;
  adminExpert: number;
  employeeChampion: number;
  dominant: string;
  description: string;
}

export interface HarvardModel {
  situationalFactors: string[];
  stakeholderInterests: string[];
  hrPolicies: string[];
  hrOutcomes: string[];
  longTermConsequences: string[];
  summary: string;
}

export interface HrAnalysis {
  hrWheel: HrWheelArea[] | null;
  competingValues: CompetingValues | null;
  ulrichModel: UlrichModel | null;
  harvardModel: HarvardModel | null;
  careerPageUrl: string | null;
  dataCollectionNote: string | null;
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

export interface CompanyAnalysisProgress {
  type: 'log' | 'searching' | 'scoring' | 'done' | 'error';
  message?: string;
  result?: CompanyAnalysisDto;
}

export interface CompanyAnalysisDto {
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
  // AI 생성
  swot: SwotAnalysis | null;
  competitors: Competitor[] | null;
  competitorSources: { title: string; url: string }[] | null;
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
  hrTechSources: { category: string; title: string; url: string }[] | null;
  jobplanetSummary: string | null;
  missionVision: { mission: string | null; vision: string | null; coreValues: string[]; talentProfile: string | null } | null;
  // HR 분석
  hrAnalysis: HrAnalysis | null;
  // 인근 아파트 시세
  apartmentPrices: {
    district: string;
    avgDealPrice: number | null;
    avgLeasePrice: number | null;
    minDealPrice: number | null;
    maxDealPrice: number | null;
    minLeasePrice: number | null;
    maxLeasePrice: number | null;
    complexCount: number;
    naverLandUrl: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}
