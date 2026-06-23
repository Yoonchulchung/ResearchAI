import type {
  JobPosting,
  JobPostingFilterOptions,
  JobPostingListFilters,
} from 'src/recruit/domain/job-posting.model';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';

// ── Constants ─────────────────────────────────────────────────────────────────

export const COMPANY_TYPE_OPTIONS = [
  '대기업',
  '중견기업',
  '중소기업',
  '외국계기업',
  '공공기관',
  '금융기관',
];
export const INTERESTED_CATEGORIES = ['IT', '기획', '전자'];
export const FINANCIAL_COMPANY_KEYWORDS = [
  '금융',
  '금융권',
  '은행',
  '뱅크',
  '증권',
  '보험',
  '카드',
  '캐피탈',
  '자산운용',
  '저축은행',
  '신협',
  '새마을금고',
];
export const PUBLIC_COMPANY_KEYWORDS = [
  '공공기관',
  '공기업',
  '공사',
  '공단',
  '국립',
  '시청',
  '구청',
  '도청',
  '군청',
];
export const IGNORED_TITLE_PATTERNS = [
  /인재\s*(풀|pool)/i,
  /인재\s*db/i,
  /talent\s*pool/i,
  /상시.*pool/i,
  /pool.*상시/i,
  /pool\s*등록/i,
  /홀서빙/i,
];
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  기획: [
    '기획',
    '서비스기획',
    'it기획',
    '사업기획',
    '상품기획',
    '전략기획',
    '경영기획',
    '서비스전략',
    '사업전략',
    '경영전략',
    '신사업',
    'r&d전략',
    'rd기획',
    '프로덕트',
    'pm',
    'po',
    '프로덕트매니저',
    '프로덕트오너',
    '기획자',
    '서비스플래너',
  ],
  it: [
    'it',
    '인터넷',
    '정보기술',
    '웹',
    '서버',
    '네트워크',
    '네트웍',
    '보안',
    '데이터',
    'ai',
    '인공지능',
    'ml',
    '머신러닝',
    '딥러닝',
    '자연어처리',
    'nlp',
    '빅데이터',
    'dba',
    'db',
    'dbms',
    'dw',
    'bi',
    'etl',
    'olap',
    '개발',
    '프로그래머',
    '프로그래밍',
    '퍼블리셔',
    '시스템',
    '소프트웨어',
    'sw',
    '인프라',
    '클라우드',
    'devops',
    '데브옵스',
    'sre',
    '플랫폼',
    '백엔드',
    'backend',
    '프론트엔드',
    'frontend',
    '풀스택',
    'fullstack',
    '모바일',
    '앱',
    'ios',
    'android',
    'qa',
    '테스트',
    '검증',
    'erp',
    'sap',
    'si개발',
    'sm개발',
    '아키텍트',
    'architect',
    '솔루션',
  ],
  전자: [
    '전자',
    '전기',
    '제어',
    '통신',
    '회로',
    '하드웨어',
    '임베디드',
    '펌웨어',
  ],
};
export const ELECTRONICS_STRONG_KEYWORDS = [
  '전자',
  '반도체',
  '디스플레이',
  '회로',
  '하드웨어',
  '임베디드',
  '펌웨어',
];
export const ELECTRONICS_CONTEXT_KEYWORDS = ['전기', '제어', '통신'];
export const ELECTRONICS_BROAD_FACILITY_PATTERNS = [
  /전기\/소방\/통신\/안전/,
  /소방/,
  /안전/,
];
export const NON_ELECTRONICS_JOB_KEYWORDS = [
  '객실서비스',
  '벨데스크',
  '하우스키핑',
  '고객서비스',
  '고객관리',
  '식음',
  '조리',
  '요리',
  '플로리스트',
  '경영지원',
  '인사',
  '상담',
  '웨딩',
  '매장관리',
  '판매',
];
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  it: [
    'it',
    '정보기술',
    '개발',
    '소프트웨어',
    'sw',
    '웹',
    '서버',
    '클라우드',
    '인프라',
  ],
  개발: ['개발', '개발자', '프로그래머', '프로그래밍', '소프트웨어', 'sw'],
  데이터: ['데이터', 'data', '빅데이터', 'dba', 'db', 'dw', 'bi', 'etl'],
  ai: ['ai', '인공지능', '머신러닝', 'ml', '딥러닝'],
  반도체: ['반도체', '디스플레이', '회로', '하드웨어', '공정', '장비'],
  전자: [
    '전자',
    '반도체',
    '디스플레이',
    '회로',
    '하드웨어',
    '임베디드',
    '펌웨어',
  ],
  금융: [
    '금융',
    '금융권',
    '은행',
    '증권',
    '보험',
    '카드',
    '캐피탈',
    '자산운용',
  ],
};
export const SOURCE_SEARCH_LABELS: Record<string, string[]> = {
  linkareer: ['linkareer', '링커리어'],
  jobkorea: ['jobkorea', '잡코리아'],
  catch: ['catch', '캐치'],
  jobplanet: ['jobplanet', '잡플래닛'],
  jobda: ['jobda', '잡다'],
};

// ── Simple helpers ────────────────────────────────────────────────────────────

export function normalize(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeCompanyName(value?: string): string {
  return (value ?? '')
    .replace(
      /\(주\)|㈜|주식회사|\(유\)|유한회사|\(재\)|재단법인|\(사\)|사단법인/gi,
      '',
    )
    .replace(/[()[\]{}（）·.,\s]/g, '')
    .toLowerCase();
}

export function normalizeCompanyType(value?: string): string | undefined {
  const ct = normalize(value);
  if (!ct) return undefined;
  if (
    ct.includes('공공기관') ||
    ct.includes('공기업') ||
    ct.includes('수도권공공기관')
  )
    return '공공기관';
  if (
    ct.includes('금융') ||
    ct.includes('금융권') ||
    ct.includes('은행') ||
    ct.includes('증권') ||
    ct.includes('보험') ||
    ct.includes('카드') ||
    ct.includes('캐피탈') ||
    ct.includes('자산운용')
  ) {
    return '금융기관';
  }
  if (ct.includes('외국계')) return '외국계기업';
  if (
    ct.includes('대기업') ||
    ct.includes('매출액 1조') ||
    ct.includes('코스피')
  )
    return '대기업';
  if (ct.includes('중견') || ct.includes('상위 10% 중소')) return '중견기업';
  if (
    ct.includes('중소') ||
    ct.includes('스타트업') ||
    ct.includes('벤처') ||
    ct.includes('코스닥')
  )
    return '중소기업';
  return undefined;
}

export function normalizeJobType(value?: string): string {
  const type = value ?? '';
  const upper = type.trim().toUpperCase();
  if (upper === 'NEW') return '신입';
  if (upper === 'EXPERIENCED') return '경력';
  if (upper === 'CONTRACT') return '계약직';
  if (/인턴|intern/i.test(type)) return '인턴';
  if (/신입/.test(type) && /경력/.test(type)) return '신입·경력';
  if (/신입/.test(type)) return '신입';
  if (/경력/.test(type)) return '경력';
  if (/계약/.test(type)) return '계약직';
  return type.trim();
}

export function splitComma(value?: string): string[] {
  return value
    ? value
        .split(/[,，、]/)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'ko'),
  );
}

export function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function delay(ms: number): Promise<void> {
  const jitter = ms * 0.4;
  const actual = ms - jitter + Math.random() * jitter * 2;
  return new Promise((r) => setTimeout(r, actual));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Inference ─────────────────────────────────────────────────────────────────

export function inferTypeFromTitle(title: string): string | null {
  if (!title) return null;
  if (/인턴/i.test(title)) return '인턴';
  if (/계약/i.test(title)) return '계약직';
  if (/신입/.test(title) && /경력/.test(title)) return '신입·경력';
  if (/경력/.test(title)) return '경력';
  if (/신입/.test(title)) return '신입';
  return null;
}

export function inferCompanyTypeFromCompanyName(
  value?: string,
): string | undefined {
  const name = normalize(value);
  if (!name) return undefined;
  if (FINANCIAL_COMPANY_KEYWORDS.some((k) => name.includes(normalize(k))))
    return '금융기관';
  if (PUBLIC_COMPANY_KEYWORDS.some((k) => name.includes(normalize(k))))
    return '공공기관';
  return undefined;
}

export function cleanCompanyName(name: string): string {
  const cleaned = name
    .replace(
      /\(주\)|㈜|\(유\)|㈔|주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/gi,
      '',
    )
    .replace(/[\s()（）\[\]]/g, '')
    .trim();
  return cleaned || name;
}

export function extractEmployeesFromDetail(
  text?: string | null,
): string | null {
  if (!text) return null;
  const m = text.match(
    /(?:사원\s*수|직원\s*수?|임직원|종업원)\s*[:\s]*(?:약\s*)?(\d[\d,]+)\s*명/,
  );
  if (m) return m[1].replace(/,/g, '') + '명';
  return null;
}

export function isIgnoredPosting(p: JobPosting): boolean {
  return IGNORED_TITLE_PATTERNS.some((pattern) => pattern.test(p.title));
}

// ── Source/URL resolution ─────────────────────────────────────────────────────

export function getPostingSource(
  p: JobPosting,
): NonNullable<JobPosting['source']> {
  if (p.source) return p.source;
  if (p.id.startsWith('jk-') || p.url.includes('jobkorea.co.kr'))
    return 'jobkorea';
  if (p.id.startsWith('catch-') || p.url.includes('catch.co.kr'))
    return 'catch';
  if (p.id.startsWith('jp-') || p.url.includes('jobplanet.co.kr'))
    return 'jobplanet';
  if (p.id.startsWith('jobda-') || p.url.includes('jobda.im')) return 'jobda';
  return 'linkareer';
}

export function getPostingUrl(p: JobPosting): string {
  const source = getPostingSource(p);
  if (source === 'jobda') {
    const positionId = p.id.startsWith('jobda-')
      ? p.id.slice('jobda-'.length)
      : p.url.match(/\/(?:jobs|position)\/(\d+)/)?.[1];
    return positionId
      ? `https://www.jobda.im/position/${positionId}/jd`
      : p.url;
  }
  if (source === 'jobkorea') {
    const gno = p.id.startsWith('jk-')
      ? p.id.slice('jk-'.length)
      : p.url.match(/GI_No=([^&]+)/i)?.[1] ||
        p.url.match(/GI_Read\/([0-9]+)/i)?.[1];
    return gno ? `https://www.jobkorea.co.kr/Recruit/GI_Read/${gno}` : p.url;
  }
  if (source === 'jobplanet') {
    const postingId = p.id.startsWith('jp-')
      ? p.id.slice('jp-'.length)
      : p.url.match(/posting_ids\[\]=(\d+)/)?.[1] ||
        p.url.match(/postings\/(\d+)/)?.[1];
    return postingId
      ? `https://www.jobplanet.co.kr/job/search?posting_ids[]=${postingId}`
      : p.url;
  }
  if (source !== 'catch') return p.url;
  const recruitId = p.id.startsWith('catch-')
    ? p.id.slice('catch-'.length)
    : new URL(p.url).searchParams.get('RecruitID');
  return recruitId
    ? `https://www.catch.co.kr/NCS/RecruitInfoDetails/${recruitId}`
    : p.url;
}

export function normalizePostingForStorage(posting: JobPosting): JobPosting {
  return {
    ...posting,
    source: getPostingSource(posting),
    sourceType: posting.sourceType ?? 'crawler',
    url: getPostingUrl(posting),
    location: posting.location ?? '',
    skills: Array.isArray(posting.skills) ? posting.skills : [],
    collectedAt: posting.collectedAt ?? new Date().toISOString(),
    type: inferTypeFromTitle(posting.title) ?? posting.type,
    companyType:
      normalizeCompanyType(posting.companyType) ?? posting.companyType,
  };
}

export function normalizePostingForView(
  posting: JobPosting,
  resolveCompanyType: (p: JobPosting) => string | undefined,
): JobPosting {
  return {
    ...posting,
    source: getPostingSource(posting),
    url: getPostingUrl(posting),
    type: normalizeJobType(posting.type),
    companyType:
      resolveCompanyType(posting) ??
      normalizeCompanyType(posting.companyType) ??
      posting.companyType,
  };
}

// ── Date ──────────────────────────────────────────────────────────────────────

export function parsePostingDate(raw?: string): number | null {
  if (!raw) return null;
  const isoMatch = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch)
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    ).getTime();
  const fullMatch = raw.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (fullMatch)
    return new Date(
      Number(fullMatch[1]),
      Number(fullMatch[2]) - 1,
      Number(fullMatch[3]),
    ).getTime();
  const mdMatch = raw.match(/(\d{1,2})[./](\d{1,2})/);
  if (!mdMatch) return null;
  const tday = new Date();
  const month = Number(mdMatch[1]) - 1;
  const day = Number(mdMatch[2]);
  const cur = new Date(tday.getFullYear(), month, day);
  const todayStart = new Date(
    tday.getFullYear(),
    tday.getMonth(),
    tday.getDate(),
  ).getTime();
  return cur.getTime() >= todayStart
    ? cur.getTime()
    : new Date(tday.getFullYear() + 1, month, day).getTime();
}

export function getLatestSortValue(p: JobPosting): number {
  return parsePostingDate(p.collectedAt) ?? parsePostingDate(p.startDate) ?? 0;
}

export function getDeadlineSortValue(p: JobPosting): number {
  const raw = p.endDate || p.deadline;
  if (!raw || /상시|채용\s*시|수시/i.test(raw)) return Number.MAX_SAFE_INTEGER;
  const date = parsePostingDate(raw);
  if (!date) return Number.MAX_SAFE_INTEGER;
  const tday = new Date();
  const todayStart = new Date(
    tday.getFullYear(),
    tday.getMonth(),
    tday.getDate(),
  ).getTime();
  return date < todayStart ? Number.MAX_SAFE_INTEGER - 1 : date;
}

// ── Entity mapping ────────────────────────────────────────────────────────────

export function entityToJobPosting(e: RecruitJobPostingEntity): JobPosting {
  return {
    id: e.id,
    source: e.source ?? undefined,
    sourceType: (e.sourceType as JobPosting['sourceType']) ?? 'crawler',
    title: e.title,
    company: e.company,
    location: e.location ?? '',
    url: e.url,
    companyType: e.companyType ?? undefined,
    type: e.type ?? undefined,
    startDate: e.startDate ?? undefined,
    endDate: e.endDate ?? undefined,
    deadline: e.deadline ?? undefined,
    jobs: e.jobs ?? undefined,
    homepage: e.homepage ?? undefined,
    viewCount: e.viewCount ?? undefined,
    detailContent: e.detailContent ?? undefined,
    detailHtml: e.detailHtml ?? undefined,
    collectedAt: e.collectedAt,
    favorite: e.favorite,
    appliedAt: e.appliedAt,
  };
}

export function jobPostingToEntity(
  posting: JobPosting,
): Partial<RecruitJobPostingEntity> {
  const n = normalizePostingForStorage(posting);
  return {
    id: n.id,
    source: n.source ?? null,
    sourceType: n.sourceType ?? null,
    title: n.title,
    company: n.company,
    location: n.location ?? null,
    url: n.url,
    companyType: n.companyType ?? null,
    type: n.type ?? null,
    startDate: n.startDate ?? null,
    endDate: n.endDate ?? null,
    deadline: n.deadline ?? null,
    jobs: n.jobs ?? null,
    homepage: n.homepage ?? null,
    viewCount: n.viewCount ?? null,
    detailContent: n.detailContent ?? null,
    detailHtml: n.detailHtml ?? null,
    collectedAt: n.collectedAt,
  };
}

// ── Search ────────────────────────────────────────────────────────────────────

export function getSearchTerms(search?: string): string[] {
  return [
    ...new Set(
      normalize(search)
        .split(/[\s,，、|]+/)
        .map((term) => term.replace(/^["'`]+|["'`]+$/g, '').trim())
        .filter(Boolean),
    ),
  ];
}

export function getSearchAliases(term: string): string[] {
  return [
    ...new Set(
      [term, ...(SEARCH_SYNONYMS[term] ?? [])]
        .map((v) => normalize(v))
        .filter(Boolean),
    ),
  ];
}

export function getSearchFields(
  p: JobPosting,
): Array<{ value: string; weight: number }> {
  const source = normalize(p.source);
  return [
    { value: normalizeCompanyName(p.company), weight: 16 },
    { value: normalize(p.company), weight: 14 },
    { value: normalize(p.title), weight: 12 },
    { value: normalize(p.jobs), weight: 11 },
    { value: normalize(p.location), weight: 5 },
    { value: normalize(normalizeJobType(p.type)), weight: 5 },
    {
      value: normalize(normalizeCompanyType(p.companyType) ?? p.companyType),
      weight: 5,
    },
    { value: source, weight: 4 },
    ...(SOURCE_SEARCH_LABELS[source] ?? []).map((label) => ({
      value: normalize(label),
      weight: 4,
    })),
  ];
}

export function scoreFieldMatch(
  field: string,
  term: string,
  weight: number,
): number {
  if (!field || !term) return 0;
  if (field === term) return weight * 5;
  if (field.startsWith(term)) return weight * 4;
  if (hasDelimitedTerm(field, term)) return weight * 3;
  if (term.length >= 2 && field.includes(term)) return weight * 2;
  return 0;
}

export function hasDelimitedTerm(field: string, term: string): boolean {
  return field
    .split(/[\s,，、/|·()[\]{}<>:;'"`]+/)
    .filter(Boolean)
    .some((part) => part === term || part.startsWith(term));
}

export function matchesElectronicsCategory(p: JobPosting): boolean {
  const primaryText = normalize([p.jobs, p.title].filter(Boolean).join(' '));
  if (
    ELECTRONICS_STRONG_KEYWORDS.some((k) => primaryText.includes(normalize(k)))
  )
    return true;
  if (
    ELECTRONICS_CONTEXT_KEYWORDS.some((k) => primaryText.includes(normalize(k)))
  ) {
    const isBroad = ELECTRONICS_BROAD_FACILITY_PATTERNS.some((pat) =>
      pat.test(primaryText),
    );
    const isNonElec = NON_ELECTRONICS_JOB_KEYWORDS.some((k) =>
      primaryText.includes(normalize(k)),
    );
    if (isBroad || isNonElec) return false;
    return true;
  }
  return true;
}

export function matchesInterestedCategory(
  p: JobPosting,
  category: string,
): boolean {
  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords)
    return splitComma(p.jobs).some((v) => normalize(v) === category);
  if (category === '전자') return matchesElectronicsCategory(p);
  const haystack = normalize([p.jobs, p.title].filter(Boolean).join(' '));
  return keywords.some((k) => haystack.includes(normalize(k)));
}

export function matchesCategoryFilter(
  p: { title: string; jobs?: string | null },
  category: string,
): boolean {
  return matchesInterestedCategory(p as JobPosting, normalize(category));
}

export function getSemanticSearchScore(
  p: JobPosting,
  term: string,
): number | null {
  if (term === '전자') return matchesElectronicsCategory(p) ? 80 : 0;
  if (term === 'it' || term === '개발' || term === '데이터' || term === 'ai') {
    return matchesInterestedCategory(p, 'it') ? 70 : null;
  }
  if (ELECTRONICS_STRONG_KEYWORDS.includes(term)) {
    return normalize([p.jobs, p.title].filter(Boolean).join(' ')).includes(term)
      ? 75
      : 0;
  }
  if (ELECTRONICS_CONTEXT_KEYWORDS.includes(term)) {
    const primaryText = normalize([p.jobs, p.title].filter(Boolean).join(' '));
    if (primaryText.includes(term)) return 70;
    const jobsText = normalize(p.jobs);
    if (!jobsText.includes(term)) return 0;
    const isBroad = ELECTRONICS_BROAD_FACILITY_PATTERNS.some((pat) =>
      pat.test(jobsText),
    );
    const isNonElec = NON_ELECTRONICS_JOB_KEYWORDS.some((k) =>
      primaryText.includes(normalize(k)),
    );
    return isBroad || isNonElec ? 0 : 25;
  }
  return null;
}

export function getSearchTermScore(p: JobPosting, term: string): number {
  const semanticScore = getSemanticSearchScore(p, term);
  if (semanticScore !== null) return semanticScore;
  const aliases = getSearchAliases(term);
  const fields = getSearchFields(p);
  let best = 0;
  for (const alias of aliases) {
    if (!alias) continue;
    for (const field of fields) {
      if (!field.value) continue;
      best = Math.max(best, scoreFieldMatch(field.value, alias, field.weight));
    }
  }
  return best;
}

export function getSearchScore(p: JobPosting, terms: string[]): number {
  return terms.reduce((score, term) => score + getSearchTermScore(p, term), 0);
}

export function matchesSearchTerms(p: JobPosting, terms: string[]): boolean {
  return terms.every((term) => getSearchTermScore(p, term) > 0);
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export function isPostingInScheduleRange(
  p: JobPosting,
  from: number | null,
  to: number | null,
): boolean {
  const dates = [p.startDate, p.endDate, p.deadline]
    .map((v) => parsePostingDate(v))
    .filter((v): v is number => v !== null);
  if (dates.length === 0) return false;
  return dates.some((date) => {
    if (from !== null && date < from) return false;
    if (to !== null && date > to) return false;
    return true;
  });
}

export function applyFilters(
  items: JobPosting[],
  filters: JobPostingListFilters,
  searchTerms: string[],
): JobPosting[] {
  const company = normalizeCompanyName(filters.company);
  const job = normalize(filters.job);
  const companyType = normalize(filters.companyType);
  const excludedCompanyTypes = (filters.excludeCompanyType ?? '')
    .split(',')
    .map((v) => normalize(normalizeCompanyType(v.trim()) ?? v.trim()))
    .filter(Boolean);
  const type = normalize(filters.type);
  const categories = (filters.category ?? '')
    .split(',')
    .map((v) => normalize(v))
    .filter(Boolean);
  const scheduleFrom = parsePostingDate(filters.scheduleFrom);
  const scheduleTo = parsePostingDate(filters.scheduleTo);

  return items.filter((p) => {
    if (company) {
      const postingCompany = normalizeCompanyName(p.company);
      if (
        postingCompany !== company &&
        !postingCompany.includes(company) &&
        !company.includes(postingCompany)
      )
        return false;
    }
    if (companyType) {
      const allowed = companyType.split(',').map((t) => normalize(t));
      const postingCT = normalize(
        normalizeCompanyType(p.companyType) ?? p.companyType,
      );
      if (!allowed.includes(postingCT)) return false;
    }
    if (excludedCompanyTypes.length > 0) {
      const postingCT = normalize(
        normalizeCompanyType(p.companyType) ?? p.companyType,
      );
      const postingCTText = normalize(p.companyType);
      if (
        postingCT &&
        excludedCompanyTypes.some(
          (ex) => postingCT === ex || postingCTText.includes(ex),
        )
      )
        return false;
    }
    if (job && !splitComma(p.jobs).some((v) => normalize(v) === job))
      return false;
    if (type) {
      const allowed = type.split(',').map((t) => normalize(t));
      const postingType = normalize(normalizeJobType(p.type));
      if (!allowed.some((a) => postingType === a || postingType.includes(a)))
        return false;
    }
    if (
      categories.length > 0 &&
      !categories.some((cat) => matchesInterestedCategory(p, cat))
    )
      return false;
    if (
      (scheduleFrom || scheduleTo) &&
      !isPostingInScheduleRange(p, scheduleFrom, scheduleTo)
    )
      return false;
    if (searchTerms.length === 0) return true;
    return matchesSearchTerms(p, searchTerms);
  });
}

export function sortPostings(
  items: JobPosting[],
  sort: NonNullable<JobPostingListFilters['sort']>,
): JobPosting[] {
  const copy = [...items];
  if (sort === 'deadline') {
    return copy.sort((a, b) => {
      const diff = getDeadlineSortValue(a) - getDeadlineSortValue(b);
      if (diff !== 0) return diff;
      return getLatestSortValue(b) - getLatestSortValue(a);
    });
  }
  return copy.sort((a, b) => {
    const diff = getLatestSortValue(b) - getLatestSortValue(a);
    if (diff !== 0) return diff;
    return getDeadlineSortValue(a) - getDeadlineSortValue(b);
  });
}

export function sortPostingsBySearchRelevance(
  items: JobPosting[],
  searchTerms: string[],
  sort: NonNullable<JobPostingListFilters['sort']>,
): JobPosting[] {
  return sortPostings(items, sort).sort(
    (a, b) => getSearchScore(b, searchTerms) - getSearchScore(a, searchTerms),
  );
}

export function getFilterOptions(items: JobPosting[]): JobPostingFilterOptions {
  return {
    jobs: uniqueSorted(items.flatMap((p) => splitComma(p.jobs))),
    companyTypes: COMPANY_TYPE_OPTIONS,
    types: uniqueSorted(
      items.map((p) => normalizeJobType(p.type)).filter(Boolean),
    ),
    categories: INTERESTED_CATEGORIES.filter((category) =>
      items.some((item) =>
        matchesInterestedCategory(item, normalize(category)),
      ),
    ),
  };
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export function getImageExt(url: string, contentType: string): string {
  if (contentType.includes('/png')) return '.png';
  if (contentType.includes('/gif')) return '.gif';
  if (contentType.includes('/webp')) return '.webp';
  if (contentType.includes('/svg')) return '.svg';
  const pathname = url.split('?')[0].toLowerCase();
  if (pathname.endsWith('.png')) return '.png';
  if (pathname.endsWith('.gif')) return '.gif';
  if (pathname.endsWith('.webp')) return '.webp';
  if (pathname.endsWith('.svg')) return '.svg';
  return '.jpg';
}

export function findHtmlContent(obj: unknown, depth = 0): string | undefined {
  if (depth > 6 || !obj || typeof obj !== 'object') return undefined;
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (typeof val === 'string' && val.length > 100 && /<[a-zA-Z]/.test(val))
      return val;
    if (val && typeof val === 'object') {
      const found = findHtmlContent(val, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}
