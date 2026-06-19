import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Page } from 'puppeteer';
import { PuppeteerService } from 'src/browse/infrastructure/puppeteer.service';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { CompanyNewsTimelineEntity } from 'src/company/domain/entity/company-news-timeline.entity';
import {
  deduplicateNewsItems,
  filterNewNewsItems,
} from 'src/news/application/news-dedup.utils';

interface ScrapedArticle {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

function toNaverDate(d: Date): string {
  return d.toISOString().substring(0, 10).replace(/-/g, '');
}

function subtractMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - months);
  return r;
}

/** "2022-08" → 그 달 1일의 전날 (= 2022-07-31) */
function endOfPrevMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 0); // day=0 → 전달 말일
}

const MIN_ARTICLES = 10;
const WINDOW_MONTHS = 3;
const MAX_ATTEMPTS = 8; // 최대 8 * 3 = 24개월 소급
const OLDEST_YEAR = 2010;

@Injectable()
export class CompanyNewsScraperService {
  private readonly logger = new Logger(CompanyNewsScraperService.name);

  constructor(
    private readonly puppeteer: PuppeteerService,
    @InjectRepository(CompanyNewsEntity)
    private readonly newsRepo: Repository<CompanyNewsEntity>,
    @InjectRepository(CompanyNewsTimelineEntity)
    private readonly timelineRepo: Repository<CompanyNewsTimelineEntity>,
  ) {}

  /**
   * DB의 가장 오래된 publishedAt(non-null) 기준으로 그 이전 데이터를 수집.
   * 수집 결과가 MIN_ARTICLES 미만이면 창을 더 소급하여 최대 MAX_ATTEMPTS회 시도.
   */
  async scrapeHistorical(
    companyId: string,
    companyName: string,
  ): Promise<{
    fetched: number;
    saved: number;
    hasMore: boolean;
    dateFrom: string;
    dateTo: string;
  }> {
    // publishedAt이 null인 레코드를 제외하고 가장 오래된 기사 조회
    const oldest = await this.newsRepo.findOne({
      where: { companyId, publishedAt: Not(IsNull()) },
      order: { publishedAt: 'ASC' },
      select: ['publishedAt'],
    });

    // 수집 창의 시작점: oldest 달의 전달 말일
    let currentDateTo: Date;
    if (oldest?.publishedAt) {
      const ym = oldest.publishedAt.substring(0, 7); // "2022-08"
      currentDateTo = endOfPrevMonth(ym); // "2022-07-31"
      this.logger.log(
        `가장 오래된 기사: ${oldest.publishedAt} → 수집 기준일: ${currentDateTo.toISOString().substring(0, 10)}`,
      );
    } else {
      currentDateTo = new Date(); // 데이터 없으면 오늘부터
    }

    const allArticles: ScrapedArticle[] = [];
    const seenUrls = new Set<string>();
    let firstDateFrom = currentDateTo;
    const initialDateTo = currentDateTo;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const dateFrom = subtractMonths(currentDateTo, WINDOW_MONTHS);

      this.logger.log(
        `시도 ${attempt + 1}/${MAX_ATTEMPTS}: ${dateFrom.toISOString().substring(0, 10)} ~ ${currentDateTo.toISOString().substring(0, 10)}`,
      );

      const articles = await this.scrapeNaverRange(
        companyName,
        dateFrom,
        currentDateTo,
      );

      // 전체 누적에서 중복 제거
      for (const a of articles) {
        if (!seenUrls.has(a.url)) {
          seenUrls.add(a.url);
          allArticles.push(a);
        }
      }

      firstDateFrom = dateFrom;

      if (allArticles.length >= MIN_ARTICLES) break;
      if (dateFrom.getFullYear() <= OLDEST_YEAR) break;

      // 다음 창: 이번 창 시작일의 전날부터 다시 소급
      currentDateTo = new Date(dateFrom);
      currentDateTo.setDate(currentDateTo.getDate() - 1);

      // 창 간 딜레이
      await new Promise((r) => setTimeout(r, 500));
    }

    const saved = await this.saveItems(companyId, allArticles);
    const hasMore = firstDateFrom.getFullYear() > OLDEST_YEAR;

    // 새로 수집된 기사의 월에 해당하는 기존 타임라인 삭제 → incremental 재분석 가능하게
    if (allArticles.length > 0) {
      const months = new Set(
        allArticles
          .filter((a) => a.publishedAt)
          .map((a) => a.publishedAt!.substring(0, 7)),
      );
      for (const ym of months) {
        await this.timelineRepo.delete({ companyId, yearMonth: ym });
      }
      this.logger.log(
        `타임라인 초기화 (재분석 대상): ${[...months].sort().join(', ')}`,
      );
    }

    this.logger.log(
      `스크래핑 완료: ${allArticles.length}건 수집, ${saved}건 저장, hasMore=${hasMore}`,
    );

    return {
      fetched: allArticles.length,
      saved,
      hasMore,
      dateFrom: firstDateFrom.toISOString().substring(0, 10),
      dateTo: initialDateTo.toISOString().substring(0, 10),
    };
  }

  private async scrapeNaverRange(
    companyName: string,
    dateFrom: Date,
    dateTo: Date,
    maxPages = 5,
  ): Promise<ScrapedArticle[]> {
    const from = toNaverDate(dateFrom);
    const to = toNaverDate(dateTo);
    const today = new Date().toISOString().substring(0, 10);
    const articles: ScrapedArticle[] = [];
    const seenUrls = new Set<string>();

    // ds/de 형식: YYYY.MM.DD
    const toDotDate = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const ds = toDotDate(dateFrom);
    const de = toDotDate(dateTo);

    for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
      const start = pageIdx * 10 + 1;
      // 따옴표 없는 회사명 + 날짜 필터 + 뉴스 탭 직접 지정
      const url =
        `https://search.naver.com/search.naver?ssc=tab.news.all` +
        `&query=${encodeURIComponent(companyName)}` +
        `&sm=tab_opt&sort=1&photo=0&field=0&pd=3` +
        `&ds=${ds}&de=${de}` +
        `&nso=so:r,p:from${from}to${to}` +
        `&start=${start}`;

      try {
        const items = await this.puppeteer.withPage(async (page: Page) => {
          await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          );
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
          await page
            .waitForSelector('section._prs_nws a[href]', { timeout: 5_000 })
            .catch(() => {});

          return page.evaluate((todayStr: string) => {
            const newsSection =
              document.querySelector('section._prs_nws') ??
              document.querySelector('.sp_nnews') ??
              document.querySelector('[class*="_prs_nws"]') ??
              document.querySelector('#main_pack');

            const allAnchors = Array.from(
              (newsSection ?? document).querySelectorAll('a[href]'),
            ) as HTMLAnchorElement[];

            const isNewsUrl = (href: string) => {
              if (!href.startsWith('http')) return false;
              if (href.includes('media.naver.com/press')) return false;
              if (href.includes('search.naver.com')) return false;
              if (
                href.includes('naver.com/') &&
                !href.includes('n.news.naver.com') &&
                !href.includes('news.naver.com/article')
              )
                return false;
              return true;
            };

            const titleLinks = allAnchors.filter((a) => {
              const text = a.textContent?.trim() ?? '';
              return text.length >= 15 && isNewsUrl(a.href);
            });

            const results: Array<{
              title: string;
              url: string;
              snippet: string;
              publishedAt: string | null;
            }> = [];
            const seenInPage = new Set<string>();

            for (const a of titleLinks) {
              const href = a.href.split('?')[0];
              if (seenInPage.has(href)) continue;
              seenInPage.add(href);

              const title = a.textContent?.trim() ?? '';
              const card = a.closest('[class]') ?? a.parentElement;
              let publishedAt: string | null = null;

              const timeEl = card
                ?.closest('[class]')
                ?.querySelector('time[datetime]') as HTMLElement | null;
              if (timeEl?.getAttribute('datetime')) {
                const dt = timeEl.getAttribute('datetime')!;
                const m = dt.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (m) publishedAt = `${m[1]}-${m[2]}-${m[3]}`;
              }

              if (!publishedAt) {
                const cardText = card?.closest('[class]')?.textContent ?? '';
                const dm = cardText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
                if (dm) publishedAt = `${dm[1]}-${dm[2]}-${dm[3]}`;
                else if (/시간|분|초|방금|오늘/.test(cardText))
                  publishedAt = todayStr;
                else if (/어제/.test(cardText)) {
                  const d = new Date(todayStr);
                  d.setDate(d.getDate() - 1);
                  publishedAt = d.toISOString().substring(0, 10);
                }
              }

              results.push({ title, url: a.href, snippet: '', publishedAt });
            }

            return results;
          }, today);
        });

        for (const item of items) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            articles.push(item);
          }
        }

        if (items.length === 0) break;

        await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
      } catch (e) {
        this.logger.warn(
          `페이지 스크래핑 실패 (start=${start}): ${(e as Error).message}`,
        );
        break;
      }
    }

    return articles;
  }

  private async saveItems(
    companyId: string,
    items: ScrapedArticle[],
  ): Promise<number> {
    if (!items.length) return 0;
    const existing = await this.newsRepo.find({
      where: { companyId },
      select: ['title', 'url', 'publishedAt', 'fetchedAt', 'snippet'],
    });
    const newItems = filterNewNewsItems(existing, deduplicateNewsItems(items));
    let saved = 0;
    await Promise.allSettled(
      newItems.map(async (item) => {
        try {
          const result = await this.newsRepo
            .createQueryBuilder()
            .insert()
            .into(CompanyNewsEntity)
            .values({
              id: randomUUID(),
              companyId,
              title: item.title,
              url: item.url,
              snippet: item.snippet || null,
              publishedAt: item.publishedAt ?? null,
            })
            .orIgnore()
            .execute();
          if ((result.raw?.changes ?? result.identifiers?.length ?? 0) > 0)
            saved++;
        } catch {
          /* URL unique violation 무시 */
        }
      }),
    );
    return saved;
  }
}
