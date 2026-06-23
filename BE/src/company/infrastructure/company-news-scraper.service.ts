import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { BrowserService } from 'src/browse/application/browser.service';
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
    private readonly browser: BrowserService,
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
    const articles: ScrapedArticle[] = [];
    const seenUrls = new Set<string>();

    for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
      const start = pageIdx * 10 + 1;
      try {
        const items = await this.browser.searchNews({
          query: companyName,
          start,
          dateFrom: dateFrom.toISOString().substring(0, 10),
          dateTo: dateTo.toISOString().substring(0, 10),
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
