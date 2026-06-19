import type { SearchSources } from 'src/research/domain/model/search-sources.model';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import {
  ZERO_SCORES,
  CompetencyScores,
  CompetencyReasons,
  SwotAnalysis,
  Competitor,
  BusinessSegment,
  CompanyProfile,
  HrAnalysis,
  CompanyAnalysisDto,
} from 'src/company/domain/company-analysis.types';
import {
  YearlyFinancial,
  EmployeeDetail,
} from 'src/company/infrastructure/dart/dart-types';

const NEWS_SITE_PATTERNS = [
  'news',
  'media',
  'press',
  'newswire',
  'yna.co.kr',
  'yonhap',
  'kbs',
  'mbc',
  'sbs',
  'jtbc',
  'chosun',
  'joongang',
  'hani',
  'khan',
  'donga',
  'heraldcorp',
  'edaily',
  'etnews',
  'zdnet',
  'mk.co.kr',
  'hankyung',
  'sedaily',
  'mt.co.kr',
  'asiae',
  'fnnews',
  'newspim',
  'bizwatch',
  'thebell',
];
const JOB_BOARD_PATTERNS = [
  'saramin',
  'jobkorea',
  'wanted',
  'incruit',
  'linkareer',
  'catch.co',
  'jumpit',
  'rallit',
  'programmers',
  'rocketpunch',
  'recruit',
  'career',
  'job',
  'employ',
  'hiring',
  '채용',
];

/** 검색 엔진이 반환하는 "[제목]\n내용\n출처: url" 형식에서 링크를 추출 */
export function parseSearchLinks(
  text: string,
): { title: string; url: string }[] {
  if (!text) return [];
  const results: { title: string; url: string }[] = [];
  const re = /^\[(.+)]\s*\n[\s\S]*?^출처:\s*(https?:\/\/[^\s]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const title = cleanSearchTitle(m[1]);
    const url = m[2].trim();
    if (title && url) results.push({ title, url });
  }
  return results;
}

export function cleanSearchTitle(title: string): string {
  return decodeHtmlEntities(title)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+[^-]{1,30}$/g, (suffix) => {
      const source = suffix.slice(3).trim().toLowerCase();
      return /^(namu\.wiki|나무위키)$/i.test(source) ? '' : suffix;
    })
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function isBadNewsTitle(title: string): boolean {
  const cleaned = cleanSearchTitle(title);
  if (cleaned.length < 8) return true;
  if (/^\[[^\]]*$/.test(cleaned)) return true;
  if (/[°Ãìíêëûü]{2,}/.test(cleaned)) return true;
  return false;
}

export function isJobPosting(url: string, title: string): boolean {
  const combined = (url + ' ' + title).toLowerCase();
  return JOB_BOARD_PATTERNS.some((p) => combined.includes(p));
}

export function isNewsArticle(url: string): boolean {
  return NEWS_SITE_PATTERNS.some((p) => url.toLowerCase().includes(p));
}

export function isLikelyNewsArticle(url: string, title: string): boolean {
  const combined = `${url} ${title}`.toLowerCase();
  return (
    isNewsArticle(url) ||
    /뉴스|보도자료|보도 자료|press|newsroom|media/.test(combined)
  );
}

export function isNaverBlog(url: string): boolean {
  return url.toLowerCase().includes('blog.naver.com');
}

/** AI가 JSON 문자열 내부에 줄바꿈·탭 등 제어문자를 그대로 출력할 때 이스케이프 복구 */
export function repairJsonStr(s: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
    } else {
      if (ch === '\\') {
        result += ch;
        i++;
        if (i < s.length) result += s[i];
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    }
    i++;
  }
  return result;
}

export function normalizeKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalizeUrl(value: string): string {
  return value
    .trim()
    .replace(/[),.;\]]+$/g, '')
    .replace(/\/+$/g, '');
}

export function getHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function getDefaultSearchSourceText(sources?: SearchSources): string {
  return (
    sources?.duckduckgo ??
    sources?.tavily ??
    sources?.serper ??
    sources?.naver ??
    sources?.brave ??
    ''
  );
}

export function toDto(
  e: CompanyAnalysisEntity,
  rate?: CompanyRateEntity | null,
): CompanyAnalysisDto {
  const parse = <T>(json: string | null): T | null => {
    if (!json) return null;
    try {
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  };
  const c = e.company ?? null;
  const fin = c?.financial ?? null;

  return {
    id: e.id,
    companyKey: e.companyKey,
    companyName: e.companyName,
    scores: parse<CompetencyScores>(e.scores) ?? { ...ZERO_SCORES },
    reasons: parse<CompetencyReasons>(e.reasons),
    summary: e.summary,
    evidence: parse<{ title: string; url: string }[]>(e.evidence),
    aiModel: e.aiModel,
    inputTokens: e.inputTokens ?? null,
    outputTokens: e.outputTokens ?? null,
    estimatedFees: e.estimatedFees ?? null,
    swot: parse<SwotAnalysis>(e.swot),
    competitors: (() => {
      const raw = parse<unknown[]>(e.competitors);
      if (!raw?.length) return null;
      if (typeof raw[0] === 'string') return null;
      return raw as Competitor[];
    })(),
    competitorSources: parse<{ title: string; url: string }[]>(
      e.competitorSources,
    ),
    businessSegments: (() => {
      const raw = parse<unknown[]>(e.businessSegments);
      if (!raw?.length) return null;
      if (typeof raw[0] === 'string') return null;
      return raw as BusinessSegment[];
    })(),
    segmentSources: parse<{ title: string; url: string }[]>(e.segmentSources),
    companyProfile: parse<CompanyProfile>(e.companyProfile),
    industry: c?.industry ?? null,
    companySize: c?.companyType ?? null,
    creditRating: e.creditRating,
    report: e.report,
    corpClass: fin?.corpClass ?? null,
    stockCode: fin?.stockCode ?? null,
    employees: c?.employees ?? null,
    employeeHistory: (() => {
      const raw = parse<EmployeeDetail | EmployeeDetail[]>(
        fin?.employeeDetail ?? null,
      );
      if (!raw) return null;
      return Array.isArray(raw) ? raw : [raw];
    })(),
    capital: fin?.capital ?? null,
    homeUrl: c?.homeUrl ?? null,
    address: c?.address ?? null,
    dartUrl: c?.dartUrl ?? null,
    ceoName: c?.ceoName ?? null,
    foundedDate: c?.foundedDate ?? null,
    fiscalYear: (() => {
      const mf = parse<YearlyFinancial[]>(fin?.multiYearFinancials ?? null);
      return mf?.at(-1)?.year != null ? `${mf.at(-1)!.year}년` : null;
    })(),
    multiYearFinancials: parse<YearlyFinancial[]>(
      fin?.multiYearFinancials ?? null,
    ),
    financialSummary: fin?.financialSummary ?? null,
    disclosures: parse<{ title: string; date: string; url: string }[]>(
      fin?.disclosures ?? null,
    ),
    recentNews: parse<
      {
        title: string;
        url: string;
        date: string;
        category?: string;
        summary?: string;
      }[]
    >(e.recentNews),
    jobPostings: parse<{ title: string; url: string; date: string }[]>(
      e.jobPostings,
    ),
    hrTechSources: parse<{ category: string; title: string; url: string }[]>(
      e.hrTechSources,
    ),
    jobplanetSummary: rate?.summary ?? null,
    missionVision: parse<{
      mission: string | null;
      vision: string | null;
      coreValues: string[];
      talentProfile: string | null;
    }>(e.missionVision),
    hrAnalysis: parse<HrAnalysis>(e.hrAnalysis),
    apartmentPrices: parse<CompanyAnalysisDto['apartmentPrices']>(
      e.apartmentPrices,
    ),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
