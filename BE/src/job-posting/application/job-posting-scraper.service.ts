import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type {
  JobPosting,
  JobPostingFilterOptions,
  JobPostingListFilters,
  JobPostingScrapeOptions,
  JobPostingScrapeStatus,
} from '../domain/job-posting.model';
import { LinkareerJobCrawler } from '../infrastructure/linkareer-job.crawler';
import { JobkoreaJobCrawler } from '../infrastructure/jobkorea-job.crawler';
import { CatchJobCrawler } from '../infrastructure/catch-job.crawler';
import { JobplanetJobCrawler } from '../infrastructure/jobplanet-job.crawler';
import { JobdaJobCrawler } from '../infrastructure/jobda-job.crawler';

const DATA_DIR = path.resolve(__dirname, '../../../data/job-postings');
const JSONL_FILE = path.join(DATA_DIR, 'job-postings.jsonl');
const IDS_FILE = path.join(DATA_DIR, 'collected-ids.json');
const COMPANY_PROFILES_FILE = path.join(DATA_DIR, 'company-profiles.json');
const CHECKPOINT_FILE = path.join(DATA_DIR, 'crawl-checkpoint.json');
const COMPANY_TYPE_OPTIONS = ['대기업', '중견기업', '중소기업', '외국계기업', '공공기관', '금융기관'];
const COMPANY_PROFILE_SOURCE_PRIORITY: Record<CompanyProfileSource, number> = {
  manual: 100,
  dart: 80,
  publicData: 70,
  jobSite: 40,
  search: 30,
};
const INTERESTED_CATEGORIES = ['IT', '전자'];
const FINANCIAL_COMPANY_KEYWORDS = [
  '금융',
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
const PUBLIC_COMPANY_KEYWORDS = [
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
const IGNORED_TITLE_PATTERNS = [
  /인재\s*(풀|pool)/i,
  /인재\s*db/i,
  /talent\s*pool/i,
  /상시.*pool/i,
  /pool.*상시/i,
  /pool\s*등록/i,
];
const CATEGORY_KEYWORDS: Record<string, string[]> = {
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
    '반도체',
    '디스플레이',
    '제어',
    '통신',
    '회로',
    '하드웨어',
    '임베디드',
    '펌웨어',
    '설비',
  ],
};

type CompanyProfileSource = 'manual' | 'dart' | 'publicData' | 'jobSite' | 'search';

interface CompanyProfile {
  companyName: string;
  normalizedName: string;
  companyType: string;
  source: CompanyProfileSource;
  evidence?: string;
  updatedAt: string;
}

interface CompanyProfileFile {
  version: 1;
  updatedAt: string;
  profiles: Record<string, CompanyProfile>;
}

interface CrawlSourceCheckpoint {
  lastCompletedPage: number;
  done: boolean;
  updatedAt: string;
}

interface CrawlCheckpointFile {
  date: string; // YYYY-MM-DD
  sources: Record<string, CrawlSourceCheckpoint>;
}

@Injectable()
export class JobPostingScraperService implements OnModuleInit {
  private readonly logger = new Logger(JobPostingScraperService.name);
  private readonly linkareerCrawler = new LinkareerJobCrawler();
  private readonly jobkoreaCrawler = new JobkoreaJobCrawler();
  private readonly catchCrawler = new CatchJobCrawler();
  private readonly jobplanetCrawler = new JobplanetJobCrawler();
  private readonly jobdaCrawler = new JobdaJobCrawler();

  private collectedIds = new Set<string>();
  private companyProfiles = new Map<string, CompanyProfile>();
  private crawlCheckpoint: CrawlCheckpointFile = { date: '', sources: {} };
  private status: JobPostingScrapeStatus = {
    running: false,
    currentPage: 0,
    totalCollected: 0,
    totalSkipped: 0,
    errors: 0,
    startedAt: null,
    lastActivity: null,
  };

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.loadCollectedIds();
    await this.loadCompanyProfiles();
    await this.bootstrapCompanyProfilesFromPostings();
    await this.loadCheckpoint();
    this.status.totalCollected = this.collectedIds.size;
  }

  getStatus(): JobPostingScrapeStatus {
    return { ...this.status };
  }

  async startScraping(opts: JobPostingScrapeOptions = {}): Promise<{ message: string }> {
    if (this.status.running) return { message: '이미 수집 중입니다.' };

    this.status = {
      running: true,
      currentPage: opts.startPage ?? 1,
      totalCollected: this.collectedIds.size,
      totalSkipped: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    this.runScraping(opts).catch((err) => {
      this.logger.error('스크래핑 중 오류', err);
      this.status.running = false;
    });

    const source = opts.source ?? 'linkareer';
    return { message: source === 'all' ? '전체 사이트 병렬 수집을 시작했습니다.' : '채용공고 수집을 시작했습니다.' };
  }

  stopScraping(): { message: string } {
    if (!this.status.running) return { message: '실행 중인 수집 작업이 없습니다.' };
    this.status.running = false;
    return { message: '수집 중단 요청됨.' };
  }

  async fetchDetailContent(
    id: string,
    url: string,
    source: string,
  ): Promise<Pick<JobPosting, 'companyType' | 'jobs' | 'detailContent' | 'detailHtml'>> {
    try {
      if (source === 'linkareer') {
        const detail = await this.linkareerCrawler.getDetail(id);
        return {
          companyType: detail.companyType,
          jobs: detail.jobs,
          detailHtml: detail.detailHtml,
        };
      }

      if (source === 'jobkorea') {
        const gno = id.startsWith('jk-') ? id.slice('jk-'.length) : id;
        return this.parseJobkoreaDetail(gno);
      }

      if (source === 'jobplanet') {
        return this.parseJobplanetDetail(url);
      }

      if (source === 'jobda') {
        return this.parseJobdaDetail(url);
      }

      const html = await this.fetchHtml(url);
      if (!html) return {};
      const $ = load(html);

      if (source === 'catch') {
        const recruitId = id.startsWith('catch-') ? id.slice('catch-'.length) : id;
        return this.parseCatchDetail($, recruitId);
      }

      // 기타 — 범용 텍스트 추출
      $('script, style, nav, header, footer').remove();
      let text = '';
      for (const sel of ['article', 'main', '#content', '.content']) {
        const el = $(sel).first();
        if (!el.length) continue;
        text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 200) break;
      }
      return { detailContent: text || undefined };
    } catch (err) {
      this.logger.warn(`fetchDetailContent 오류: ${err}`);
      return {};
    }
  }

  private async parseJobkoreaDetail(
    gno: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const iframeUrl = `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${gno}&isHiringCenter=false&hideMapView=false`;
    const html = await this.fetchHtml(iframeUrl);
    if (!html) return {};

    const $ = load(html);
    $('script, style').remove();

    // data-src → src 폴백
    $('img').each((_, img) => {
      const $img = $(img);
      const dataSrc = $img.attr('data-src');
      if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
    });

    const contentEl = $('article.view-content, div#container, div#secDetailRead').first();
    const detailHtml = contentEl.length ? contentEl.html()?.trim() : $('body').html()?.trim();
    return { detailHtml: detailHtml || undefined };
  }

  private async parseJobdaDetail(
    url: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const html = await this.fetchHtml(url, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.jobda.im/',
    });
    if (!html) return {};

    const $ = load(html);

    // Next.js __NEXT_DATA__ — CSR 페이지도 서버 사이드 props가 포함됨
    const nextDataRaw = $('script#__NEXT_DATA__').html();
    if (nextDataRaw) {
      try {
        const nextData = JSON.parse(nextDataRaw);
        const content = this.findHtmlContent(nextData?.props?.pageProps);
        if (content) return { detailHtml: content };
      } catch {}
    }

    // DOM 폴백: contents_infoArea (infoJobflex + 형제 img/p 모두 포함하는 부모)
    $('script, style, nav, header, footer').remove();
    const contentEl = $('[class*="contents_infoArea"]').first();
    if (contentEl.length) {
      contentEl.find('script, style').remove();
      contentEl.find('img').each((_, img) => {
        const $img = $(img);
        const dataSrc = $img.attr('data-src');
        if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
      });
      const content = contentEl.html()?.trim();
      if (content && content.length > 50) return { detailHtml: content };
    }

    // 최후 폴백: main
    const mainEl = $('main').first();
    mainEl.find('script, style').remove();
    return { detailHtml: mainEl.html()?.trim() || undefined };
  }

  private findHtmlContent(obj: unknown, depth = 0): string | undefined {
    if (depth > 6 || !obj || typeof obj !== 'object') return undefined;
    for (const val of Object.values(obj as Record<string, unknown>)) {
      if (typeof val === 'string' && val.length > 100 && /<[a-zA-Z]/.test(val)) {
        return val;
      }
      if (val && typeof val === 'object') {
        const found = this.findHtmlContent(val, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  }

  private async parseJobplanetDetail(
    url: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const encodedUrl = url.replace(/\[]/g, '%5B%5D');
    const html = await this.fetchHtml(encodedUrl, {
      'jp-ssr-auth': 'jobplanet_desktop_ssr_1d6f8a5f219176accbb8fe051729fc6a',
      'jp-os-type': 'web',
      Referer: 'https://www.jobplanet.co.kr/job',
    });
    if (!html) return {};

    const $ = load(html);

    // 메인 콘텐츠 컬럼만 타겟 (nav/필터 영역 제외)
    const mainContent = $('div[class*="min-w-0"][class*="flex-1"]').first();
    if (!mainContent.length) return {};

    // iframe embed 케이스 (JobKorea 등 외부 플랫폼 공고)
    const iframeSrc = mainContent.find('iframe').first().attr('src');
    if (iframeSrc) {
      const iframeUrl = iframeSrc.startsWith('http')
        ? iframeSrc
        : `https://www.jobplanet.co.kr${iframeSrc}`;
      const iframeHtml = await this.fetchHtml(iframeUrl);
      if (iframeHtml) {
        const $i = load(iframeHtml);
        $i('script, style, noscript').remove();
        const content = $i('body').html()?.trim();
        if (content) return { detailHtml: content };
      }
    }

    // 일반 케이스: h3.new-h2가 있는 section만 (콘텐츠 섹션)
    const htmlParts: string[] = [];
    mainContent.find('section').each((_, section) => {
      const $s = $(section);
      if (!$s.find('[class*="new-h2"]').length) return;
      $s.find('script, style').remove();
      $s.find('img').each((_, img) => {
        const $img = $(img);
        const dataSrc = $img.attr('data-src');
        if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
      });
      const content = $s.html()?.trim();
      if (content && content.length > 30) htmlParts.push(content);
    });

    return { detailHtml: htmlParts.join('\n\n') || undefined };
  }

  private async parseCatchDetail(
    $: CheerioAPI,
    recruitId: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const htmlParts: string[] = [];

    // 요약 정보 — 부모 페이지에서 텍스트 추출
    const summaryEl = $('.recr_pop_summary').first();
    summaryEl.find('script, style').remove();
    const summaryHtml = summaryEl.html()?.trim();
    if (summaryHtml) htmlParts.push(summaryHtml);

    // 메인 콘텐츠 — iframe URL 직접 fetch
    const iframeUrl = `https://www.catch.co.kr/controls/recruitDetail/${recruitId}`;
    const iframeHtml = await this.fetchHtml(iframeUrl);
    if (iframeHtml) {
      const $i = load(iframeHtml);
      $i('script, style').remove();
      const contentEl = $i('#recr_type_img, #iframe_wrapper').first();
      if (contentEl.length) {
        const content = contentEl.html()?.trim();
        if (content) htmlParts.push(content);
      }
    }

    return { detailHtml: htmlParts.join('\n\n') || undefined };
  }

  private async fetchHtml(url: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          ...extraHeaders,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return res.text();
    } catch {
      return null;
    }
  }

  async getData(
    page: number,
    limit: number,
    filters: JobPostingListFilters = {},
  ): Promise<{ items: JobPosting[]; total: number; filterOptions: JobPostingFilterOptions }> {
    const all = (await this.readAllFromJsonl()).map((posting) => this.normalizePostingForView(posting));

    const visible = all.filter((p) => !this.isIgnoredPosting(p));
    const sourceFiltered = filters.source ? visible.filter((p) => p.source === filters.source) : visible;
    const filtered = this.applyFilters(sourceFiltered, filters);
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      filterOptions: this.getFilterOptions(sourceFiltered),
    };
  }

  async getPostingById(id: string): Promise<JobPosting | null> {
    const all = await this.readAllFromJsonl();
    const posting = all.find((p) => p.id === id);
    return posting ? this.normalizePostingForView(posting) : null;
  }

  // ────────────────────────────────────────────────
  // private
  // ────────────────────────────────────────────────

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async loadCheckpoint() {
    if (!fs.existsSync(CHECKPOINT_FILE)) return;
    try {
      this.crawlCheckpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      const sources = Object.entries(this.crawlCheckpoint.sources)
        .map(([k, v]) => `${k}:p${v.lastCompletedPage}${v.done ? '(완료)' : ''}`)
        .join(', ');
      this.logger.log(`체크포인트 로드 — ${this.crawlCheckpoint.date} [${sources || '없음'}]`);
    } catch {
      this.logger.warn('체크포인트 로드 실패 — 초기화');
    }
  }

  private saveCheckpoint() {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(this.crawlCheckpoint, null, 2), 'utf-8');
  }

  private updateSourceCheckpoint(label: string, lastPage: number, done: boolean) {
    this.crawlCheckpoint.sources[label] = {
      lastCompletedPage: lastPage,
      done,
      updatedAt: new Date().toISOString(),
    };
    this.saveCheckpoint();
  }

  private async runScraping(opts: JobPostingScrapeOptions) {
    const today = this.today();
    if (this.crawlCheckpoint.date !== today) {
      this.logger.log(`새 날짜(${today}) 감지 — 체크포인트 초기화`);
      this.crawlCheckpoint = { date: today, sources: {} };
      this.saveCheckpoint();
    }

    const source = opts.source ?? 'linkareer';

    if (source === 'all') {
      // 전체 수집에서는 링커리어 신입공채만 포함한다.
      await Promise.allSettled([
        this.runCrawlerLoop('linkareer', (p) =>
          this.linkareerCrawler.getPostingsFromPage(p, { jobType: 'RECRUIT', status: opts.status }), opts),
        this.runCrawlerLoop('jobkorea', (p) => this.jobkoreaCrawler.getPostingsFromPage(p), opts),
        this.runCrawlerLoop('catch', (p) => this.catchCrawler.getPostingsFromPage(p), opts),
        this.runCrawlerLoop('jobplanet', (p) => this.jobplanetCrawler.getPostingsFromPage(p), opts),
        this.runCrawlerLoop('jobda', (p) => this.jobdaCrawler.getPostingsFromPage(p), opts),
      ]);
    } else {
      const fetchPage =
        source === 'jobkorea' ? (p: number) => this.jobkoreaCrawler.getPostingsFromPage(p)
          : source === 'catch' ? (p: number) => this.catchCrawler.getPostingsFromPage(p)
            : source === 'jobplanet' ? (p: number) => this.jobplanetCrawler.getPostingsFromPage(p)
              : source === 'jobda' ? (p: number) => this.jobdaCrawler.getPostingsFromPage(p)
                : (p: number) => this.linkareerCrawler.getPostingsFromPage(p, { jobType: opts.jobType, status: opts.status });

      await this.runCrawlerLoop(source, fetchPage, opts);
    }

    this.status.running = false;
    this.logger.log(`수집 종료 — 총 ${this.status.totalCollected}개 (에러 ${this.status.errors}개)`);
  }

  private async runCrawlerLoop(
    label: string,
    fetchPage: (page: number) => Promise<JobPosting[]>,
    opts: JobPostingScrapeOptions,
  ) {
    const delayMs = opts.delayMs ?? 2000;
    const maxPages = opts.maxPages ?? Infinity;

    // Determine start page: explicit opts > same-day checkpoint resume > 1
    const sourceCheckpoint = this.crawlCheckpoint.sources[label];
    const startPage = opts.startPage ?? (
      (sourceCheckpoint && !sourceCheckpoint.done)
        ? sourceCheckpoint.lastCompletedPage + 1
        : 1
    );
    if (opts.startPage === undefined && sourceCheckpoint && !sourceCheckpoint.done) {
      this.logger.log(`[${label}] 체크포인트 복원: 페이지 ${startPage}부터 재개`);
    }

    let page = startPage;
    let emptyPageCount = 0;
    let exhausted = false;

    while (this.status.running) {
      if (page - startPage >= maxPages) break;

      this.status.lastActivity = new Date().toISOString();
      this.status.currentPage = page;

      let postings: JobPosting[];
      try {
        postings = await fetchPage(page);
      } catch (err) {
        this.logger.warn(`[${label}] 페이지 ${page} 오류: ${err}`);
        this.status.errors++;
        break;
      }

      if (postings.length === 0) {
        emptyPageCount++;
        if (emptyPageCount >= 3) {
          this.logger.log(`[${label}] 빈 페이지 3회 연속 — 완료`);
          exhausted = true;
          break;
        }
      } else {
        emptyPageCount = 0;
      }

      const newPostings = postings.filter((p) => !this.collectedIds.has(p.id));
      this.logger.log(`[${label}] 페이지 ${page}: ${postings.length}개 중 신규 ${newPostings.length}개`);

      for (const posting of newPostings) {
        if (!this.status.running) break;
        // 병렬 실행 시 다른 루프가 먼저 저장했을 수 있으므로 재확인
        if (this.collectedIds.has(posting.id)) {
          this.status.totalSkipped++;
          continue;
        }
        if (this.isIgnoredPosting(posting)) {
          this.collectedIds.add(posting.id);
          fs.writeFileSync(IDS_FILE, JSON.stringify([...this.collectedIds]), 'utf-8');
          this.status.totalSkipped++;
          continue;
        }
        if (label === 'linkareer' && opts.fetchDetail === true) {
          const detail = await this.linkareerCrawler.getDetail(posting.id);
          Object.assign(posting, detail);
          await this.delay(delayMs * 0.5);
        }
        if (this.collectedIds.has(posting.id)) continue; // detail 대기 중 저장됐을 경우
        await this.savePosting(posting);
        this.status.totalCollected++;
      }

      this.status.totalSkipped += postings.length - newPostings.length;
      // 페이지 완료마다 체크포인트 저장 (중단 후 재개 가능)
      this.updateSourceCheckpoint(label, page, false);
      page++;
      await this.delay(delayMs);
    }

    // 자연 종료 시 done 표시 — 다음 실행은 페이지 1부터 새로 시작
    this.updateSourceCheckpoint(label, page - 1, exhausted);
  }

  private async savePosting(p: JobPosting) {
    fs.appendFileSync(JSONL_FILE, JSON.stringify(p) + '\n', 'utf-8');
    this.collectedIds.add(p.id);
    fs.writeFileSync(IDS_FILE, JSON.stringify([...this.collectedIds]), 'utf-8');
    if (this.upsertCompanyProfileFromPosting(p)) {
      this.saveCompanyProfiles();
    }
  }

  private async loadCollectedIds() {
    if (!fs.existsSync(IDS_FILE)) return;
    try {
      const arr: string[] = JSON.parse(fs.readFileSync(IDS_FILE, 'utf-8'));
      this.collectedIds = new Set(arr);
      this.logger.log(`기존 수집 ID ${this.collectedIds.size}개 로드`);
    } catch {
      this.logger.warn('collected-ids.json 로드 실패 — 초기화');
    }
  }

  private async loadCompanyProfiles() {
    if (!fs.existsSync(COMPANY_PROFILES_FILE)) return;
    try {
      const file = JSON.parse(fs.readFileSync(COMPANY_PROFILES_FILE, 'utf-8')) as Partial<CompanyProfileFile>;
      this.companyProfiles = new Map(Object.entries(file.profiles ?? {}));
      this.logger.log(`기업 프로필 ${this.companyProfiles.size}개 로드`);
    } catch {
      this.logger.warn('company-profiles.json 로드 실패 — 초기화');
      this.companyProfiles = new Map();
    }
  }

  private async bootstrapCompanyProfilesFromPostings() {
    const postings = await this.readAllFromJsonl();
    let changed = false;
    for (const posting of postings) {
      changed = this.upsertCompanyProfileFromPosting(posting) || changed;
    }
    if (changed) this.saveCompanyProfiles();
  }

  private saveCompanyProfiles() {
    const sortedProfiles = [...this.companyProfiles.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ko'));
    const file: CompanyProfileFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      profiles: Object.fromEntries(sortedProfiles),
    };
    fs.writeFileSync(COMPANY_PROFILES_FILE, `${JSON.stringify(file, null, 2)}\n`, 'utf-8');
  }

  private async readAllFromJsonl(): Promise<JobPosting[]> {
    if (!fs.existsSync(JSONL_FILE)) return [];
    const results: JobPosting[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(JSONL_FILE, 'utf-8'),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try { results.push(JSON.parse(line)); } catch { /* 손상된 라인 무시 */ }
    }
    return results;
  }

  private getPostingSource(p: JobPosting): NonNullable<JobPosting['source']> {
    if (p.source) return p.source;

    if (p.id.startsWith('jk-') || p.url.includes('jobkorea.co.kr')) return 'jobkorea';
    if (p.id.startsWith('catch-') || p.url.includes('catch.co.kr')) return 'catch';
    if (p.id.startsWith('jp-') || p.url.includes('jobplanet.co.kr')) return 'jobplanet';
    if (p.id.startsWith('jobda-') || p.url.includes('jobda.im')) return 'jobda';

    return 'linkareer';
  }

  private getPostingUrl(p: JobPosting): string {
    const source = this.getPostingSource(p);
    if (source === 'jobda') {
      const positionId = p.id.startsWith('jobda-')
        ? p.id.slice('jobda-'.length)
        : p.url.match(/\/(?:jobs|position)\/(\d+)/)?.[1];

      return positionId ? `https://www.jobda.im/position/${positionId}/jd` : p.url;
    }
    if (source === 'jobkorea') {
      const gno = p.id.startsWith('jk-')
        ? p.id.slice('jk-'.length)
        : p.url.match(/GI_No=([^&]+)/i)?.[1] || p.url.match(/GI_Read\/([0-9]+)/i)?.[1];
      return gno ? `https://www.jobkorea.co.kr/Recruit/GI_Read/${gno}` : p.url;
    }

    if (source === 'jobplanet') {
      const postingId = p.id.startsWith('jp-')
        ? p.id.slice('jp-'.length)
        : p.url.match(/posting_ids\[\]=(\d+)/)?.[1] || p.url.match(/postings\/(\d+)/)?.[1];
      return postingId ? `https://www.jobplanet.co.kr/job/search?posting_ids[]=${postingId}` : p.url;
    }

    if (source !== 'catch') return p.url;

    const recruitId = p.id.startsWith('catch-')
      ? p.id.slice('catch-'.length)
      : new URL(p.url).searchParams.get('RecruitID');

    return recruitId ? `https://www.catch.co.kr/NCS/RecruitInfoDetails/${recruitId}` : p.url;
  }

  private normalizePostingForView(posting: JobPosting): JobPosting {
    return {
      ...posting,
      source: this.getPostingSource(posting),
      url: this.getPostingUrl(posting),
      type: this.normalizeJobType(posting.type),
      companyType: this.resolveCompanyType(posting) ?? this.normalizeCompanyType(posting.companyType) ?? posting.companyType,
    };
  }

  private resolveCompanyType(p: JobPosting): string | undefined {
    const profile = this.companyProfiles.get(this.normalizeCompanyName(p.company));
    if (!profile) return undefined;

    const inferred = this.inferCompanyTypeFromCompanyName(p.company);
    if (profile.source === 'jobSite' && inferred) return inferred;

    return profile.companyType;
  }

  private upsertCompanyProfileFromPosting(p: JobPosting): boolean {
    const companyType = this.inferCompanyTypeFromCompanyName(p.company) ?? this.normalizeCompanyType(p.companyType);
    if (!companyType) return false;

    return this.upsertCompanyProfile({
      companyName: p.company,
      companyType,
      source: 'jobSite',
      evidence: p.companyType,
    });
  }

  private upsertCompanyProfile(input: {
    companyName: string;
    companyType: string;
    source: CompanyProfileSource;
    evidence?: string;
  }): boolean {
    const normalizedName = this.normalizeCompanyName(input.companyName);
    if (!normalizedName || !input.companyType) return false;

    const existing = this.companyProfiles.get(normalizedName);
    if (
      existing &&
      COMPANY_PROFILE_SOURCE_PRIORITY[existing.source] > COMPANY_PROFILE_SOURCE_PRIORITY[input.source]
    ) {
      return false;
    }

    const next: CompanyProfile = {
      companyName: existing?.companyName ?? input.companyName,
      normalizedName,
      companyType: input.companyType,
      source: input.source,
      evidence: input.evidence,
      updatedAt: new Date().toISOString(),
    };

    if (
      existing &&
      existing.companyType === next.companyType &&
      existing.source === next.source &&
      existing.evidence === next.evidence
    ) {
      return false;
    }

    this.companyProfiles.set(normalizedName, next);
    return true;
  }

  private applyFilters(items: JobPosting[], filters: JobPostingListFilters): JobPosting[] {
    const search = this.normalize(filters.search);
    const job = this.normalize(filters.job);
    const companyType = this.normalize(filters.companyType);
    const type = this.normalize(filters.type);
    const category = this.normalize(filters.category);

    return items.filter((p) => {
      if (companyType) {
        const allowedCompanyTypes = this.splitComma(companyType).map(t => this.normalize(t));
        const postingCompanyType = this.normalize(this.normalizeCompanyType(p.companyType) ?? p.companyType);
        if (!allowedCompanyTypes.includes(postingCompanyType)) return false;
      }
      if (job && !this.splitComma(p.jobs).some((value) => this.normalize(value) === job)) return false;
      if (type) {
        const allowedTypes = this.splitComma(type).map(t => this.normalize(t));
        const postingType = this.normalize(this.normalizeJobType(p.type));
        if (!allowedTypes.includes(postingType)) return false;
      }
      if (category && !this.matchesInterestedCategory(p, category)) return false;
      if (!search) return true;

      return [
        p.company,
        p.title,
        p.location,
        p.category,
        p.type,
        p.jobs,
        p.companyType,
      ].some((value) => this.normalize(value).includes(search));
    });
  }

  private isIgnoredPosting(p: JobPosting): boolean {
    return IGNORED_TITLE_PATTERNS.some((pattern) => pattern.test(p.title));
  }

  private getFilterOptions(items: JobPosting[]): JobPostingFilterOptions {
    return {
      jobs: this.uniqueSorted(items.flatMap((p) => this.splitComma(p.jobs))),
      companyTypes: COMPANY_TYPE_OPTIONS,
      types: this.uniqueSorted(items.map((p) => this.normalizeJobType(p.type)).filter(Boolean)),
      categories: INTERESTED_CATEGORIES.filter((category) =>
        items.some((item) => this.matchesInterestedCategory(item, this.normalize(category))),
      ),
    };
  }

  private matchesInterestedCategory(p: JobPosting, category: string): boolean {
    const keywords = CATEGORY_KEYWORDS[category];
    if (!keywords) {
      return this.splitComma(p.category).some((value) => this.normalize(value) === category);
    }

    const haystack = this.normalize([
      p.category,
      p.jobs,
      p.title,
    ].filter(Boolean).join(' '));

    return keywords.some((keyword) => haystack.includes(this.normalize(keyword)));
  }

  private normalizeCompanyType(value?: string): string | undefined {
    const companyType = this.normalize(value);
    if (!companyType) return undefined;

    if (companyType.includes('공공기관') || companyType.includes('공기업')) return '공공기관';
    if (
      companyType.includes('금융') ||
      companyType.includes('은행') ||
      companyType.includes('증권') ||
      companyType.includes('보험') ||
      companyType.includes('카드') ||
      companyType.includes('캐피탈') ||
      companyType.includes('자산운용')
    ) {
      return '금융기관';
    }
    if (companyType.includes('외국계')) return '외국계기업';
    if (companyType.includes('대기업') || companyType.includes('매출액 1조') || companyType.includes('코스피')) return '대기업';
    if (companyType.includes('중견')) return '중견기업';
    if (
      companyType.includes('중소') ||
      companyType.includes('스타트업') ||
      companyType.includes('벤처') ||
      companyType.includes('코스닥')
    ) {
      return '중소기업';
    }

    return undefined;
  }

  private inferCompanyTypeFromCompanyName(value?: string): string | undefined {
    const companyName = this.normalize(value);
    if (!companyName) return undefined;

    if (FINANCIAL_COMPANY_KEYWORDS.some((keyword) => companyName.includes(this.normalize(keyword)))) {
      return '금융기관';
    }
    if (PUBLIC_COMPANY_KEYWORDS.some((keyword) => companyName.includes(this.normalize(keyword)))) {
      return '공공기관';
    }

    return undefined;
  }

  private normalizeCompanyName(value?: string): string {
    return (value ?? '')
      .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(재\)|재단법인|\(사\)|사단법인/gi, '')
      .replace(/[()[\]{}（）·.,\s]/g, '')
      .toLowerCase();
  }

  private splitComma(value?: string): string[] {
    return value ? value.split(/[,，、]/).map((v) => v.trim()).filter(Boolean) : [];
  }

  private normalize(value?: string): string {
    return (value ?? '').trim().toLowerCase();
  }

  private normalizeJobType(value?: string): string {
    const type = value ?? '';
    const normalized = type.trim().toUpperCase();
    if (normalized === 'NEW') return '신입';
    if (normalized === 'EXPERIENCED') return '경력';
    if (normalized === 'CONTRACT') return '계약직';
    if (/인턴|intern/i.test(type)) return '인턴';
    if (/신입/.test(type) && /경력/.test(type)) return '신입·경력';
    if (/신입/.test(type)) return '신입';
    if (/경력/.test(type)) return '경력';
    if (/계약/.test(type)) return '계약직';
    return type.trim();
  }

  private uniqueSorted(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  }

  private delay(ms: number) {
    const jitter = ms * 0.4;
    const actual = ms - jitter + Math.random() * jitter * 2;
    return new Promise((r) => setTimeout(r, actual));
  }
}
