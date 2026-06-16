import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PuppeteerService } from '../../browse/infrastructure/puppeteer.service';
import { CompanyNewsEntity } from '../domain/entity/company-news.entity';

export interface CompanyNewsItem {
  id?: string;
  title: string;
  url: string;
  snippet: string;
  fetchedAt?: string;
}

@Injectable()
export class CompanyNewsService {
  private readonly logger = new Logger(CompanyNewsService.name);

  constructor(
    private readonly puppeteer: PuppeteerService,
    @InjectRepository(CompanyNewsEntity)
    private readonly newsRepo: Repository<CompanyNewsEntity>,
  ) {}

  /** 실시간 수집 + DB 저장 */
  async fetchAndSaveNews(companyId: string, companyName: string, limit = 12): Promise<CompanyNewsItem[]> {
    const query = `"${companyName}" 뉴스 최신`;
    this.logger.log(`기업 뉴스 검색: ${query}`);

    let items: CompanyNewsItem[] = [];
    try {
      const results = await this.puppeteer.searchGoogle(query, limit);
      items = results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
    } catch (e) {
      this.logger.warn(`뉴스 검색 실패 (${companyName}): ${(e as Error).message}`);
      return [];
    }

    // DB upsert (URL 기준 중복 제거)
    if (items.length) {
      await Promise.allSettled(
        items.map((item) =>
          this.newsRepo
            .createQueryBuilder()
            .insert()
            .into(CompanyNewsEntity)
            .values({
              id: randomUUID(),
              companyId,
              title: item.title,
              url: item.url,
              snippet: item.snippet || null,
              source: 'DuckDuckGo',
            })
            .orIgnore()  // 중복 URL이면 무시 (SQLite: OR IGNORE)
            .execute()
            .catch(() => {/* unique violation 무시 */}),
        ),
      );
      this.logger.log(`${companyName} 뉴스 ${items.length}건 저장 완료`);
    }

    return items;
  }

  /** DB에 저장된 뉴스 조회 */
  async getSavedNews(companyId: string, limit = 30): Promise<CompanyNewsItem[]> {
    const rows = await this.newsRepo.find({
      where: { companyId },
      order: { fetchedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      snippet: r.snippet ?? '',
      fetchedAt: r.fetchedAt.toISOString(),
    }));
  }

  /** 하위 호환: 실시간 수집만 (저장 없음) */
  async fetchNews(companyName: string, limit = 10): Promise<CompanyNewsItem[]> {
    const query = `"${companyName}" 뉴스 최신`;
    try {
      const results = await this.puppeteer.searchGoogle(query, limit);
      return results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
    } catch (e) {
      this.logger.warn(`뉴스 검색 실패 (${companyName}): ${(e as Error).message}`);
      return [];
    }
  }
}
