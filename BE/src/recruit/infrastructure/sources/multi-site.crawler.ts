import puppeteer, { Browser, Page } from 'puppeteer';
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { JobPosting } from 'src/recruit/domain/job-posting.model';
import {
  CollectQuery,
  JobSource,
} from 'src/recruit/domain/job-source.interface';

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

interface RawJob {
  title: string;
  company: string;
  tags: string;
  deadline: string;
  url: string;
  source: string;
}

/**
 * 4개 취업 사이트 (링커리어·원티드·잡플래닛·인크루트) 단일 브라우저로 순차 수집.
 * 브라우저 실행 오버헤드를 최소화하기 위해 하나의 세션을 재사용함.
 */
export class MultiSiteJobCrawler implements JobSource {
  readonly name = 'multi-site';
  readonly type = 'crawler' as const;
  private readonly logger = new Logger(MultiSiteJobCrawler.name);

  isAvailable(): boolean {
    return true;
  }

  async *collect(query: CollectQuery): AsyncGenerator<JobPosting> {
    const perSite =
      query.limit && query.limit < Number.MAX_SAFE_INTEGER
        ? Math.ceil(query.limit / 4)
        : 9999;
    const searchKeyword = query.keyword ?? '';
    let browser: Browser | null = null;

    this.logger.log(
      `[크롤] 시작 — keyword="${searchKeyword}" perSite=${perSite}`,
    );

    try {
      this.logger.log('[크롤] 브라우저 실행 중...');
      browser = await puppeteer.launch({ headless: true, args: BROWSER_ARGS });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });
      this.logger.log('[크롤] 브라우저 준비 완료');
      const allJobs: RawJob[] = [];

      // ── 1. 링커리어 ────────────────────────────────────────────────────────
      try {
        this.logger.log(`[링커리어] 수집 시작 (최대 ${perSite}개)`);
        const jobs = await this.scrapeLinkareer(
          page,
          searchKeyword,
          perSite,
          query.jobTypes,
        );
        this.logger.log(`[링커리어] ${jobs.length}개 수집 완료`);
        if (jobs.length > 0)
          this.logger.debug(
            `[링커리어] 첫 결과: "${jobs[0].title}" — ${jobs[0].company}`,
          );
        allJobs.push(...jobs);
      } catch (e) {
        this.logger.warn(
          `[링커리어] 실패 — ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // ── 2. 원티드 ─────────────────────────────────────────────────────────
      try {
        this.logger.log(`[원티드] 수집 시작 (최대 ${perSite}개)`);
        const jobs = await this.scrapeWanted(page, searchKeyword, perSite);
        this.logger.log(`[원티드] ${jobs.length}개 수집 완료`);
        if (jobs.length > 0)
          this.logger.debug(
            `[원티드] 첫 결과: "${jobs[0].title}" — ${jobs[0].company}`,
          );
        allJobs.push(...jobs);
      } catch (e) {
        this.logger.warn(
          `[원티드] 실패 — ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // ── 3. 잡플래닛 채용 ──────────────────────────────────────────────────
      try {
        this.logger.log(`[잡플래닛] 수집 시작 (최대 ${perSite}개)`);
        const jobs = await this.scrapeJobplanet(
          page,
          searchKeyword,
          perSite,
          query.jobTypes,
        );
        this.logger.log(`[잡플래닛] ${jobs.length}개 수집 완료`);
        if (jobs.length > 0)
          this.logger.debug(
            `[잡플래닛] 첫 결과: "${jobs[0].title}" — ${jobs[0].company}`,
          );
        allJobs.push(...jobs);
      } catch (e) {
        this.logger.warn(
          `[잡플래닛] 실패 — ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // ── 4. 인크루트 ───────────────────────────────────────────────────────
      try {
        this.logger.log(`[인크루트] 수집 시작 (최대 ${perSite}개)`);
        const jobs = await this.scrapeIncruit(
          page,
          searchKeyword,
          perSite,
          query.jobTypes,
        );
        this.logger.log(`[인크루트] ${jobs.length}개 수집 완료`);
        if (jobs.length > 0)
          this.logger.debug(
            `[인크루트] 첫 결과: "${jobs[0].title}" — ${jobs[0].company}`,
          );
        allJobs.push(...jobs);
      } catch (e) {
        this.logger.warn(
          `[인크루트] 실패 — ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // ── 5. 잡코리아 ───────────────────────────────────────────────────────
      try {
        this.logger.log(`[잡코리아] 수집 시작 (최대 ${perSite}개)`);
        const jobs = await this.scrapeJobkorea(
          page,
          searchKeyword,
          perSite,
          query.jobTypes,
        );
        this.logger.log(`[잡코리아] ${jobs.length}개 수집 완료`);
        if (jobs.length > 0)
          this.logger.debug(
            `[잡코리아] 첫 결과: "${jobs[0].title}" — ${jobs[0].company}`,
          );
        allJobs.push(...jobs);
      } catch (e) {
        this.logger.warn(
          `[잡코리아] 실패 — ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      this.logger.log(`[크롤] 전체 수집 완료 — 총 ${allJobs.length}개`);

      for (const job of allJobs) {
        yield {
          id: randomUUID(),
          source: job.source,
          sourceType: 'crawler',
          title: job.title,
          company: job.company,
          location: '',
          description: job.tags,
          skills: job.tags
            ? job.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          url: job.url,
          postedAt: job.deadline || null,
          collectedAt: new Date().toISOString(),
        };
      }
    } finally {
      await browser?.close();
      this.logger.log('[크롤] 브라우저 종료');
    }
  }

  // ── 링커리어 ────────────────────────────────────────────────────────────────
  private async scrapeLinkareer(
    page: Page,
    keyword: string,
    limit: number,
    jobTypes?: string[],
  ): Promise<RawJob[]> {
    const url = `https://linkareer.com/search?q=${encodeURIComponent(keyword)}&sort=RELEVANCE&tab=activity&page=1`;
    this.logger.log(`[링커리어] GET ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise<void>((r) => setTimeout(r, 3000));

    return page.evaluate(
      (baseUrl: string, lim: number, jt: string[] | undefined) => {
        const results: {
          title: string;
          company: string;
          tags: string;
          deadline: string;
          url: string;
          source: string;
        }[] = [];
        const seen = new Set<string>();

        // 카드 단위 수집 — 링크가 포함된 최상위 래퍼
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[class*="ActivityListItem"], [class*="activity-list-item"], li, article',
          ),
        );
        for (const card of cards) {
          if (results.length >= lim) break;

          // 채용 칩만 허용 (대외활동, 공모전 등 제외)
          const chipLabel =
            card
              .querySelector('.MuiChip-label, [class*="label-chip"]')
              ?.textContent?.trim() ?? '';
          if (chipLabel && chipLabel !== '채용') continue;

          const link = card.querySelector<HTMLAnchorElement>(
            'a[href*="/activity/"]',
          );
          if (!link) continue;
          const href = link.href || link.getAttribute('href') || '';
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const title = (
            card.querySelector('p.title, [class*="title"]')?.textContent ??
            link.textContent ??
            ''
          )
            .replace(/\s+/g, ' ')
            .trim();
          if (!title) continue;

          const company = (
            card.querySelector('p.company-name, [class*="company"]')
              ?.textContent ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim();

          // 신입/경력 필터
          const jobTypeText = Array.from(
            card.querySelectorAll('p.short-info-typo, [class*="short-info"]'),
          )
            .map((el) => el.textContent?.trim() ?? '')
            .join(' ');
          if (jt && jt.length > 0) {
            const matched = jt.some(
              (t) =>
                jobTypeText.includes(t) ||
                (t === '신입' && jobTypeText.includes('신입')) ||
                (t === '경력' && jobTypeText.includes('경력')),
            );
            if (!matched) continue;
          }

          const text = card.textContent ?? '';
          const deadlineMatch = text.match(
            /~\d+\.\d+|\d{4}[./]\d{2}[./]\d{2}|D-\d+/,
          );

          results.push({
            title,
            company,
            tags: jobTypeText,
            deadline: deadlineMatch?.[0] ?? '',
            url: href.startsWith('http') ? href : baseUrl + href,
            source: 'linkareer',
          });
        }
        return results;
      },
      'https://linkareer.com',
      limit,
      jobTypes,
    );
  }

  // ── 원티드 ──────────────────────────────────────────────────────────────────
  private async scrapeWanted(
    page: Page,
    keyword: string,
    limit: number,
  ): Promise<RawJob[]> {
    const url = `https://www.wanted.co.kr/search?query=${encodeURIComponent(keyword)}&search_method=popular&tab=overview`;
    this.logger.log(`[원티드] GET ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise<void>((r) => setTimeout(r, 3000));

    return page.evaluate(
      (baseUrl: string, lim: number) => {
        const results: {
          title: string;
          company: string;
          tags: string;
          deadline: string;
          url: string;
          source: string;
        }[] = [];
        const seen = new Set<string>();

        // /wd/{id} 패턴이 원티드 포지션 링크
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href*="/wd/"]'),
        );
        for (const link of links) {
          if (results.length >= lim) break;
          const href = link.href || link.getAttribute('href') || '';
          if (!href.includes('/wd/') || seen.has(href)) continue;
          seen.add(href);

          const card =
            link.closest('li, article, [class*="Card"], [class*="card"]') ??
            link;
          const titleEl =
            link.querySelector(
              'strong, h2, h3, [class*="title"], [class*="Title"]',
            ) ?? link;
          const title = (titleEl.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!title) continue;

          const spans = Array.from(card.querySelectorAll('span'))
            .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
            .filter((t) => t && t !== title && t.length < 50);
          const company = spans[0] ?? '';

          results.push({
            title,
            company,
            tags: '',
            deadline: '',
            url: href.startsWith('http') ? href : baseUrl + href,
            source: 'wanted',
          });
        }
        return results;
      },
      'https://www.wanted.co.kr',
      limit,
    );
  }

  // ── 잡플래닛 채용 ────────────────────────────────────────────────────────────
  private async scrapeJobplanet(
    page: Page,
    keyword: string,
    limit: number,
    jobTypes?: string[],
  ): Promise<RawJob[]> {
    const url = `https://www.jobplanet.co.kr/search/job?query=${encodeURIComponent(keyword)}`;
    this.logger.log(`[잡플래닛] GET ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise<void>((r) => setTimeout(r, 3000));

    return page.evaluate(
      (lim: number, jt: string[] | undefined) => {
        const results: {
          title: string;
          company: string;
          tags: string;
          deadline: string;
          url: string;
          source: string;
        }[] = [];

        // Next.js __NEXT_DATA__ JSON에서 직접 추출
        const nextDataEl = document.getElementById('__NEXT_DATA__');
        if (!nextDataEl?.textContent) return results;

        try {
          const nextData = JSON.parse(nextDataEl.textContent) as Record<
            string,
            unknown
          >;

          // 잡플래닛 검색 결과는 pageProps.initialState 또는 pageProps.dehydratedState 안에 있음
          const raw = JSON.stringify(nextData);
          // job posting 배열 찾기: id, title, company.name, skills 패턴
          const match = raw.match(
            /"job_postings?":\s*(\[[\s\S]*?\])|"postings?":\s*(\[[\s\S]*?\])|"list":\s*(\[[\s\S]*?\])/,
          );

          let postings: unknown[] = [];

          // pageProps 하위를 재귀 탐색하여 배열 형태의 공고 목록 찾기
          const findPostings = (obj: unknown): unknown[] => {
            if (!obj || typeof obj !== 'object') return [];
            if (Array.isArray(obj)) {
              // 첫 원소에 title, company가 있으면 공고 배열로 판단
              if (
                obj.length > 0 &&
                typeof obj[0] === 'object' &&
                obj[0] !== null &&
                'title' in (obj[0] as object) &&
                'company' in (obj[0] as object)
              ) {
                return obj;
              }
              for (const item of obj) {
                const found = findPostings(item);
                if (found.length > 0) return found;
              }
            } else {
              for (const val of Object.values(obj as Record<string, unknown>)) {
                const found = findPostings(val);
                if (found.length > 0) return found;
              }
            }
            return [];
          };

          postings = findPostings(nextData);
          if (postings.length === 0 && match) {
            // 정규식 fallback
            postings = JSON.parse(
              match[1] ?? match[2] ?? match[3] ?? '[]',
            ) as unknown[];
          }

          for (const p of postings) {
            if (results.length >= lim) break;
            if (!p || typeof p !== 'object') continue;

            const post = p as Record<string, unknown>;
            const id = post.id as number | undefined;
            const title = (post.title as string | undefined)?.trim();
            if (!id || !title) continue;

            const company = post.company as Record<string, unknown> | undefined;
            const companyName = (company?.name as string | undefined) ?? '';
            const cityName = (company?.city_name as string | undefined) ?? '';
            const skills = Array.isArray(post.skills)
              ? (post.skills as string[]).join(', ')
              : '';
            const recruitmentText = Array.isArray(post.recruitment_text)
              ? (post.recruitment_text as string[]).join(', ')
              : (((post.annual as Record<string, unknown> | undefined)
                  ?.text as string) ?? '');
            const jobType = (post.job_type as string | undefined) ?? '';
            const deadline =
              (post.deadline_message as string | undefined) ??
              (post.end_at as string | undefined) ??
              '';

            // jobTypes 필터
            if (jt && jt.length > 0) {
              const matched = jt.some(
                (t) => recruitmentText.includes(t) || jobType.includes(t),
              );
              if (!matched) continue;
            }

            const tags = [recruitmentText, jobType, cityName, skills]
              .filter(Boolean)
              .join(', ');

            results.push({
              title,
              company: companyName,
              tags,
              deadline,
              url: `https://www.jobplanet.co.kr/job/postings/${id}`,
              source: 'jobplanet',
            });
          }
        } catch {
          // JSON 파싱 실패 시 빈 결과 반환
        }

        return results;
      },
      limit,
      jobTypes,
    );
  }

  // ── 인크루트 ────────────────────────────────────────────────────────────────
  private async scrapeIncruit(
    page: Page,
    keyword: string,
    limit: number,
    jobTypes?: string[],
  ): Promise<RawJob[]> {
    const url = `https://search.incruit.com/list/search.asp?col=job&kw=${encodeURIComponent(keyword)}`;
    this.logger.log(`[인크루트] GET ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise<void>((r) => setTimeout(r, 2000));

    return page.evaluate(
      (lim: number, jt: string[] | undefined) => {
        const results: {
          title: string;
          company: string;
          tags: string;
          deadline: string;
          url: string;
          source: string;
        }[] = [];
        const seen = new Set<string>();

        // ul.c_row 단위로 카드 순회
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>('ul.c_row'),
        );
        for (const row of rows) {
          if (results.length >= lim) break;

          // 채용 공고 링크: job.incruit.com/jobdb_info/jobpost.asp
          const link = row.querySelector<HTMLAnchorElement>(
            'a[href*="jobpost.asp"]',
          );
          if (!link) continue;
          const href = link.href || link.getAttribute('href') || '';
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!title || title.length < 3) continue;

          // 회사명: .cell_first .cpname
          const company = (row.querySelector('a.cpname')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim();

          // 지역·경력·학력·고용형태: .cl_md > span
          const metaSpans = Array.from(row.querySelectorAll('.cl_md span'))
            .map((el) => el.textContent?.trim() ?? '')
            .filter(Boolean);
          const tags = metaSpans.join(', ');

          // 신입/경력 필터
          if (jt && jt.length > 0) {
            const matched = jt.some((t) =>
              metaSpans.some((s) => s.includes(t)),
            );
            if (!matched) continue;
          }

          // 마감일: .cell_last .cl_btm span:first-child
          const deadline =
            row.querySelector('.cell_last .cl_btm span')?.textContent?.trim() ??
            '';

          results.push({
            title,
            company,
            tags,
            deadline,
            url: href,
            source: 'incruit',
          });
        }
        return results;
      },
      limit,
      jobTypes,
    );
  }

  // ── 잡코리아 ────────────────────────────────────────────────────────────────
  private async scrapeJobkorea(
    page: Page,
    keyword: string,
    limit: number,
    jobTypes?: string[],
  ): Promise<RawJob[]> {
    const url = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(keyword)}&tabType=recruit`;
    this.logger.log(`[잡코리아] GET ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise<void>((r) => setTimeout(r, 2500));

    return page.evaluate(
      (lim: number, jt: string[] | undefined) => {
        const results: {
          title: string;
          company: string;
          tags: string;
          deadline: string;
          url: string;
          source: string;
        }[] = [];
        const seen = new Set<string>();

        // 잡코리아 채용 공고 리스트: .list-default .list-post .post-list-corp
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.list-default .post-list-corp, .recruit-list .list-post li, #gidListWrap .list-item',
          ),
        );

        for (const item of items) {
          if (results.length >= lim) break;

          // 공고 링크
          const link = item.querySelector<HTMLAnchorElement>(
            'a.title, a[href*="Recruit/GI_Read"], a[href*="/recruit/"]',
          );
          if (!link) continue;
          const href = link.href || link.getAttribute('href') || '';
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!title || title.length < 3) continue;

          // 회사명
          const company = (
            item.querySelector(
              'a.corp-name, .company-name, .cpname, [class*="corpName"]',
            )?.textContent ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim();

          // 메타 정보 (직무, 고용형태, 경력 등)
          const metaEls = Array.from(
            item.querySelectorAll(
              '.chip, .etc, .info span, .post-list-info li',
            ),
          )
            .map((el) => el.textContent?.trim() ?? '')
            .filter(Boolean);
          const tags = metaEls.join(', ');

          // 신입/경력 필터
          if (jt && jt.length > 0) {
            const matched = jt.some((t) => metaEls.some((s) => s.includes(t)));
            if (!matched) continue;
          }

          // 마감일
          const deadline = (
            item.querySelector('.date, .deadline, .end-date, [class*="date"]')
              ?.textContent ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim();

          results.push({
            title,
            company,
            tags,
            deadline,
            url: href.startsWith('http')
              ? href
              : `https://www.jobkorea.co.kr${href}`,
            source: 'jobkorea',
          });
        }
        return results;
      },
      limit,
      jobTypes,
    );
  }
}
