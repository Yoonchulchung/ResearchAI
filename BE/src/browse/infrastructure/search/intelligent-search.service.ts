import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import puppeteer, { Browser, Page } from 'puppeteer';
import { DdgSearchService, DdgResult } from './ddg-search.service';
import {
  ExtractedJob,
  classifyJobSiteUrl,
  extractGenericDetail,
  extractJobkoreaDetail,
  extractLinkareerDetail,
  scrapeCatch,
  scrapeIncruit,
  scrapeJobkorea,
  scrapeJobplanet,
  scrapeJumpit,
  scrapeLinkareer,
  scrapeRallit,
  scrapeSaramin,
} from './job-site-extractors';

export interface SearchJobResult {
  id: string;
  title: string;
  company: string;
  deadline: string;
  type: string;
  url: string;
  source: string;
  relevanceScore: number;
  collectedAt: string;
}

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const BIGRAM_THRESHOLD = 0.40; // 내부 필터 (CollectService가 0.5로 2차 필터)
const MAX_VARIANTS = 10;
const MAX_DDG_QUERIES = 8;
const MAX_DDG_RESULTS_PER_QUERY = 10;

// ── Bi-gram 유틸 ─────────────────────────────────────────────────────────────

function makeBigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/\s+/g, '');
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function bigramOverlap(a: string, b: string): number {
  const aBg = makeBigrams(a);
  if (aBg.size === 0) return 1;
  const bNorm = b.toLowerCase().replace(/\s+/g, '');
  let matched = 0;
  for (const bg of aBg) {
    if (bNorm.includes(bg)) matched++;
  }
  return matched / aBg.size;
}

function isRelevant(keyword: string, job: ExtractedJob): boolean {
  if (!keyword.trim()) return true;
  const text = `${job.title} ${job.company}`;
  if (text.toLowerCase().replace(/\s+/g, '').includes(keyword.toLowerCase().replace(/\s+/g, ''))) return true;
  return bigramOverlap(keyword, text) >= BIGRAM_THRESHOLD;
}

function relevanceScore(keyword: string, job: ExtractedJob): number {
  return Math.max(
    bigramOverlap(keyword, job.title),
    bigramOverlap(keyword, job.company),
    bigramOverlap(keyword, `${job.title} ${job.company}`),
  );
}

// ── 키워드 변형 생성 ─────────────────────────────────────────────────────────

const COMPANY_SUFFIXES = [
  '코리아', '(주)', '㈜', '㈔', '주식회사', '유한회사', '합자회사',
  ' korea', ' inc', ' co', ' corp', ' ltd', ' llc',
];

function generateVariants(keyword: string): string[] {
  const kw = keyword.trim();
  const variants: string[] = [kw];

  // 1. 회사 접미사 제거한 베이스
  let base = kw.toLowerCase();
  for (const suffix of COMPANY_SUFFIXES) {
    if (base.endsWith(suffix.toLowerCase())) {
      base = base.slice(0, base.length - suffix.length).trim();
      break;
    }
  }
  const baseOrigCase = kw.slice(0, base.length) || kw;
  if (base !== kw.toLowerCase() && base.length > 2) {
    variants.push(baseOrigCase);
    variants.push(`${baseOrigCase} 코리아`);
  }

  // 2. 띄어쓰기 변형 (붙이기/떼기)
  if (kw.includes(' ')) {
    variants.push(kw.replace(/\s+/g, ''));
  } else if (kw.length > 4) {
    // 중간에 공백 삽입 시도 (중반부)
    const mid = Math.floor(kw.length / 2);
    variants.push(`${kw.slice(0, mid)} ${kw.slice(mid)}`);
  }

  // 3. 채용 관련 접미사
  for (const suffix of ['채용', '인턴', '채용공고', '인턴십', '공채', '취업']) {
    variants.push(`${kw} ${suffix}`);
  }

  // 4. 영문 변형 (베이스에서 영어 추가)
  variants.push(`${baseOrigCase} Korea`);
  variants.push(`${kw} Korea`);

  // 5. 스타/프로그램 변형 (아우모비오코리아 → 아우모비오스타 같은 파생 브랜드)
  if (kw.length > 4 && !kw.includes('스타')) {
    variants.push(`${baseOrigCase}스타`);
  }

  // 중복 제거 + 최대 개수 제한
  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = v.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key) || !key) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_VARIANTS);
}

// ── DDG 쿼리 생성 ────────────────────────────────────────────────────────────

const JOB_SITES_OR =
  'site:linkareer.com OR site:jobkorea.co.kr OR site:saramin.co.kr OR site:catch.co.kr OR site:jobplanet.co.kr OR site:wanted.co.kr OR site:jumpit.saramin.co.kr OR site:rallit.com OR site:incruit.com';

const JOB_BRAND_OR =
  '(linkareer OR jobkorea OR saramin OR catch OR jobplanet OR wanted OR jumpit OR rallit OR incruit)';

function buildDdgQueries(variants: string[]): string[] {
  const queries: string[] = [];
  const top = variants.slice(0, 4);

  for (const v of top) {
    // 사이트 스코프 쿼리 (가장 정확)
    queries.push(`"${v}" ${JOB_SITES_OR}`);
  }

  // 자유 텍스트 OR 쿼리 (범위 넓음)
  for (const v of variants.slice(0, 3)) {
    queries.push(`${v} 채용공고 ${JOB_BRAND_OR}`);
  }

  return queries.slice(0, MAX_DDG_QUERIES);
}

// ── URL 정규화 & 중복 제거 ───────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source', 'from'].forEach(
      (p) => u.searchParams.delete(p),
    );
    u.hash = '';
    return u.toString().toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

function bigramTitleSimilarity(a: string, b: string): number {
  return Math.min(bigramOverlap(a, b), bigramOverlap(b, a));
}

function deduplicateJobs(jobs: ExtractedJob[]): ExtractedJob[] {
  const seenUrls = new Set<string>();
  const unique: ExtractedJob[] = [];

  // URL 기반 1차 중복 제거
  for (const job of jobs) {
    const key = normalizeUrl(job.url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    unique.push(job);
  }

  // 제목 유사도 2차 중복 제거 (같은 공고를 여러 소스에서 수집한 경우)
  const result: ExtractedJob[] = [];
  for (const job of unique) {
    const isDup = result.some(
      (r) => bigramTitleSimilarity(job.title, r.title) >= 0.85,
    );
    if (!isDup) result.push(job);
  }

  return result;
}

// ── 페이지 셋업 ──────────────────────────────────────────────────────────────

async function setupPage(page: Page): Promise<void> {
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
}

// ── 안전 래퍼 ────────────────────────────────────────────────────────────────

async function safeScrape<T>(
  label: string,
  fn: () => Promise<T[]>,
  logger: Logger,
): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    logger.warn(`[${label}] 실패 — ${(e as Error).message}`);
    return [];
  }
}

// ── 직접 사이트 검색 ─────────────────────────────────────────────────────────

async function runDirectSearches(
  browser: Browser,
  variants: string[],
  logger: Logger,
): Promise<ExtractedJob[]> {
  // 브라우저 페이지 2개로 교차 실행
  const [page1, page2] = await Promise.all([
    browser.newPage().then(async (p) => { await setupPage(p); return p; }),
    browser.newPage().then(async (p) => { await setupPage(p); return p; }),
  ]);

  const topVariants = variants.slice(0, 3);
  const results: ExtractedJob[] = [];

  // Puppeteer가 필요한 사이트 (page 교차 사용)
  const puppeteerSites: [string, (page: Page, kw: string) => Promise<ExtractedJob[]>][] = [
    ['링커리어', scrapeLinkareer],
    ['잡코리아', scrapeJobkorea],
    ['사람인', scrapeSaramin],
    ['잡플래닛', scrapeJobplanet],
    ['인크루트', scrapeIncruit],
    ['점핏', scrapeJumpit],
    ['랠릿', scrapeRallit],
  ];

  for (let i = 0; i < puppeteerSites.length; i++) {
    const [label, fn] = puppeteerSites[i];
    const page = i % 2 === 0 ? page1 : page2;
    for (const kw of topVariants) {
      const jobs = await safeScrape(`${label}:${kw}`, () => fn(page, kw), logger);
      results.push(...jobs);
    }
  }

  // fetch 기반 사이트 (병렬 실행)
  const catchResults = await Promise.allSettled(topVariants.map((kw) => scrapeCatch(kw)));
  for (const r of catchResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }

  await Promise.allSettled([page1.close(), page2.close()]);
  return results;
}

// ── DDG URL 상세 추출 ────────────────────────────────────────────────────────

async function extractDdgOnlyUrls(
  ddgResults: DdgResult[],
  directUrlSet: Set<string>,
  browser: Browser,
  logger: Logger,
): Promise<ExtractedJob[]> {
  const toFetch = ddgResults
    .map((r) => ({ url: r.url, site: classifyJobSiteUrl(r.url) }))
    .filter((r): r is { url: string; site: string } => r.site !== null)
    .filter((r) => !directUrlSet.has(normalizeUrl(r.url)));

  if (toFetch.length === 0) return [];

  const detailPage = await browser.newPage();
  await setupPage(detailPage);
  const results: ExtractedJob[] = [];

  for (const { url, site } of toFetch) {
    let job: ExtractedJob | null = null;
    if (site === 'linkareer') {
      job = await safeScrape(
        `detail:linkareer`,
        () => extractLinkareerDetail(detailPage, url).then((j) => (j ? [j] : [])),
        logger,
      ).then((arr) => arr[0] ?? null);
    } else if (site === 'jobkorea') {
      job = await safeScrape(
        `detail:jobkorea`,
        () => extractJobkoreaDetail(detailPage, url).then((j) => (j ? [j] : [])),
        logger,
      ).then((arr) => arr[0] ?? null);
    } else {
      job = await safeScrape(
        `detail:generic:${site}`,
        () => extractGenericDetail(detailPage, url).then((j) => (j ? [j] : [])),
        logger,
      ).then((arr) => arr[0] ?? null);
    }
    if (job) results.push(job);
  }

  await detailPage.close().catch(() => {});
  return results;
}

// ── 메인 서비스 ──────────────────────────────────────────────────────────────

@Injectable()
export class IntelligentSearchService {
  private readonly logger = new Logger(IntelligentSearchService.name);

  constructor(private readonly ddg: DdgSearchService) {}

  /**
   * 채용 공고 검색 메인 메서드.
   * 여러 모듈에서 공통으로 사용.
   *
   * @example
   * const jobs = await intelligentSearch.searchJobs("아우모비오코리아");
   */
  async searchJobs(
    keyword: string,
    options: { jobTypes?: string[]; limit?: number } = {},
  ): Promise<SearchJobResult[]> {
    const kw = keyword.trim();
    if (!kw) return [];

    let browser: Browser | null = null;

    try {
      // Phase 1: 키워드 변형 생성
      const variants = generateVariants(kw);
      this.logger.log(`[Phase1] 변형 ${variants.length}개: ${variants.slice(0, 5).join(', ')}`);

      browser = await puppeteer.launch({ headless: true, args: BROWSER_ARGS });

      // Phase 2 (DDG) + Phase 3 (직접 검색) 동시 실행
      const ddgQueries = buildDdgQueries(variants);
      const [ddgResults, directJobs] = await Promise.all([
        this.ddg.searchMultiple(ddgQueries, MAX_DDG_RESULTS_PER_QUERY),
        runDirectSearches(browser, variants, this.logger),
      ]);

      this.logger.log(`[Phase2] DDG ${ddgResults.length}개 URL 발견`);
      this.logger.log(`[Phase3] 직접 검색 ${directJobs.length}개 수집`);

      // Phase 4: DDG에서만 발견된 URL 상세 추출
      const directUrlSet = new Set(directJobs.map((j) => normalizeUrl(j.url)));
      const ddgOnlyJobs = await extractDdgOnlyUrls(ddgResults, directUrlSet, browser, this.logger);
      this.logger.log(`[Phase4] DDG 전용 상세 ${ddgOnlyJobs.length}개 추출`);

      // Phase 5: 관련성 필터 + 중복 제거 + 점수 정렬
      const combined = [...directJobs, ...ddgOnlyJobs];
      const relevant = combined.filter((j) => {
        if (!j.title) return false;
        if (!isRelevant(kw, j)) return false;
        if (options.jobTypes?.length) {
          const jobTypeText = `${j.type} ${j.title}`.toLowerCase();
          const matched = options.jobTypes.some((t) => jobTypeText.includes(t.toLowerCase()));
          if (!matched) return false;
        }
        return true;
      });

      const unique = deduplicateJobs(relevant);
      const scored = unique
        .map((j) => ({ ...j, score: relevanceScore(kw, j) }))
        .sort((a, b) => b.score - a.score);

      this.logger.log(`[Phase5] ${combined.length} → ${relevant.length} 관련 → ${unique.length} 고유 → 점수 정렬 완료`);

      const limit = options.limit ?? 200;
      return scored.slice(0, limit).map((j) => ({
        id: randomUUID(),
        title: j.title,
        company: j.company,
        deadline: j.deadline,
        type: j.type,
        url: j.url,
        source: j.source,
        relevanceScore: Math.round(j.score * 100) / 100,
        collectedAt: new Date().toISOString(),
      }));
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
