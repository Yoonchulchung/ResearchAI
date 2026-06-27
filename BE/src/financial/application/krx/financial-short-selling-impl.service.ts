import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinancialCacheEntity } from 'src/financial/domain/financial-cache.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import {
  KrxShortSellingService,
  ShortSellingData,
} from 'src/financial/infrastructure/krx/krx-short-selling.service';

@Injectable()
export class FinancialShortSellingImplService {
  constructor(
    @InjectRepository(FinancialCacheEntity)
    private readonly cacheRepo: Repository<FinancialCacheEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
    private readonly krxShortSelling: KrxShortSellingService,
  ) {}

  /** UUID(companyId)로 조회 */
  async getByCompanyId(
    companyId: string,
    days = 90,
  ): Promise<ShortSellingData> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');

    const financial = await this.financialRepo.findOne({
      where: { companyId },
    });
    const stockCode = financial?.stockCode?.trim() || null;
    if (!stockCode) {
      return {
        stockCode: null,
        records: [],
        source: 'KRX',
        error: '종목코드 없음',
      };
    }

    return this.fetchAndCache(stockCode, days);
  }

  /** symbol(000660.KS)로 조회 */
  async getBySymbol(symbol: string, days = 90): Promise<ShortSellingData> {
    const code = this.extractCode(symbol);
    if (!code) {
      return {
        stockCode: null,
        records: [],
        source: 'KRX',
        error: '국내 종목 심볼만 지원합니다. (예: 000660.KS)',
      };
    }
    return this.fetchAndCache(code, days);
  }

  private async fetchAndCache(
    stockCode: string,
    days: number,
  ): Promise<ShortSellingData> {
    const normalizedDays = Math.min(Math.max(Number(days) || 90, 1), 190);
    const cacheKey = `short-selling:${stockCode}:${normalizedDays}`;
    const today = this.todayKey();

    const cached = await this.dbGet<ShortSellingData & { fetchedDate: string }>(
      cacheKey,
    );
    if (
      cached &&
      cached.fetchedDate === today &&
      (cached.records?.length ?? 0) > 0
    ) {
      return {
        stockCode: cached.stockCode,
        records: cached.records,
        source: cached.source,
      };
    }

    const fresh = await this.krxShortSelling.fetchShortSelling(
      stockCode,
      normalizedDays,
    );
    void this.dbSet(
      cacheKey,
      { ...fresh, fetchedDate: today },
      24 * 60 * 60_000,
    );
    return fresh;
  }

  private extractCode(symbol: string): string | null {
    const m = symbol
      .trim()
      .toUpperCase()
      .match(/^([0-9A-Z]+)\.K[QS]$/);
    return m ? m[1].padStart(6, '0') : null;
  }

  private async dbGet<T>(key: string): Promise<T | null> {
    const row = await this.cacheRepo.findOne({ where: { key } });
    if (!row || Date.now() > Number(row.expiresAt)) {
      if (row) void this.cacheRepo.delete({ key });
      return null;
    }
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  private async dbSet(
    key: string,
    value: unknown,
    ttlMs: number,
  ): Promise<void> {
    await this.cacheRepo.upsert(
      { key, value: JSON.stringify(value), expiresAt: Date.now() + ttlMs },
      ['key'],
    );
  }

  private todayKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}
