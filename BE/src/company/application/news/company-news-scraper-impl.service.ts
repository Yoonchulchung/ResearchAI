import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { CompanyNewsTimelineEntity } from 'src/company/domain/entity/company-news-timeline.entity';
import { NewsHistoricalCollectorService } from 'src/news/application/news-historical-collector.service';
import {
  deduplicateNewsItems,
  filterNewNewsItems,
} from 'src/news/application/news-dedup.utils';
import type {
  CompanyNewsScrapeOptions,
  CompanyNewsScrapedArticle,
  CompanyNewsScrapeResult,
} from 'src/company/application/news/company-news-scrape.types';

export type {
  CompanyNewsScrapeOptions,
  CompanyNewsScrapeProgressEvent,
  CompanyNewsScrapeResult,
  CompanyNewsScrapedArticle,
} from 'src/company/application/news/company-news-scrape.types';

/** "2022-08" → 그 달 1일의 전날 (= 2022-07-31) */
function endOfPrevMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 0); // day=0 → 전달 말일
}

@Injectable()
export class CompanyNewsScraperImplService {
  constructor(
    private readonly newsHistoricalCollector: NewsHistoricalCollectorService,
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
    options: CompanyNewsScrapeOptions = {},
  ): Promise<CompanyNewsScrapeResult> {
    options.onProgress?.({
      type: 'start',
      companyName,
      message: `${companyName} 이전 뉴스 수집을 시작합니다.`,
    });

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
    } else {
      currentDateTo = new Date(); // 데이터 없으면 오늘부터
    }

    const collected = await this.newsHistoricalCollector.collect({
      companyName,
      dateTo: currentDateTo,
      onProgress: options.onProgress,
      signal: options.signal,
      stopDate: options.stopDate,
    });
    const stopped = collected.stopped;

    options.onProgress?.({
      type: 'saving',
      fetched: collected.articles.length,
      message: stopped
        ? `중지 요청을 받았습니다. 지금까지 확인한 ${collected.articles.length}건 중 새 기사만 저장합니다.`
        : `${collected.articles.length}건을 확인했습니다. 새 기사만 저장합니다.`,
    });

    const saved = await this.saveItems(companyId, collected.articles);

    // 새로 수집된 기사의 월에 해당하는 기존 타임라인 삭제 → incremental 재분석 가능하게
    if (collected.articles.length > 0) {
      const months = new Set(
        collected.articles
          .filter((a) => a.publishedAt)
          .map((a) => a.publishedAt!.substring(0, 7)),
      );
      for (const ym of months) {
        await this.timelineRepo.delete({ companyId, yearMonth: ym });
      }
    }

    const result: CompanyNewsScrapeResult = {
      fetched: collected.articles.length,
      saved,
      hasMore: collected.hasMore,
      dateFrom: collected.dateFrom,
      dateTo: collected.dateTo,
      stopped,
      reachedStopDate: collected.reachedStopDate,
    };
    const stopDateKey = options.stopDate;
    const doneMessage =
      stopped && saved > 0
        ? `중지했습니다. ${result.dateFrom} ~ ${result.dateTo} 구간에서 찾은 신규 ${saved}건을 저장했습니다.`
        : stopped
          ? `중지했습니다. ${result.dateFrom} ~ ${result.dateTo} 구간에서 새로 저장할 뉴스가 없었습니다.`
          : result.reachedStopDate && saved > 0
            ? `${result.dateFrom} ~ ${result.dateTo} 구간에서 지정한 종료일(${stopDateKey})까지 확인했고 신규 ${saved}건을 저장했습니다.`
            : result.reachedStopDate
              ? `${result.dateFrom} ~ ${result.dateTo} 구간에서 지정한 종료일(${stopDateKey})까지 확인했지만 새로 저장할 뉴스가 없었습니다.`
              : saved > 0
                ? `${result.dateFrom} ~ ${result.dateTo} 구간에서 신규 ${saved}건을 저장했습니다.`
                : `${result.dateFrom} ~ ${result.dateTo} 구간에서 새로 저장할 뉴스가 없었습니다.`;

    options.onProgress?.({
      type: 'done',
      result,
      message: doneMessage,
    });

    return result;
  }

  private async saveItems(
    companyId: string,
    items: CompanyNewsScrapedArticle[],
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
          const raw = result.raw as unknown;
          const rawChanges =
            typeof raw === 'object' &&
            raw !== null &&
            'changes' in raw &&
            typeof raw.changes === 'number'
              ? raw.changes
              : undefined;
          if ((rawChanges ?? result.identifiers?.length ?? 0) > 0) saved++;
        } catch {
          /* URL unique violation 무시 */
        }
      }),
    );
    return saved;
  }
}
