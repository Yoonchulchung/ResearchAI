import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CompanyEntity } from '../domain/entity/company.entity';
import { CompanyFinancialEntity } from '../domain/entity/company-financial.entity';
import { CompanyInvestorTradingEntity } from '../domain/entity/company-investor-trading.entity';
import { InvestorTradingData, InvestorTradingRecord, KrxInvestorService } from './krx-investor.service';

@Injectable()
export class CompanyInvestorTradingService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
    @InjectRepository(CompanyInvestorTradingEntity)
    private readonly tradingRepo: Repository<CompanyInvestorTradingEntity>,
    private readonly krxInvestor: KrxInvestorService,
  ) {}

  async getDailyInvestorTrading(idOrName: string, days = 30): Promise<InvestorTradingData> {
    const normalizedDays = this.normalizeDays(days);
    const company = await this.findCompany(idOrName);
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');

    const financial = await this.financialRepo.findOne({ where: { companyId: company.id } });
    const stockCode = financial?.stockCode?.trim() || null;
    const today = this.todayKey();
    const cached = await this.tradingRepo.findOne({ where: { companyId: company.id } });

    if (cached && cached.fetchedDate === today && cached.days >= normalizedDays) {
      return this.toData(cached, normalizedDays);
    }

    if (!stockCode) {
      const empty: InvestorTradingData = {
        stockCode: null,
        records: [],
        source: 'KRX',
        error: '종목코드 없음',
      };
      await this.saveCache(company.id, empty, normalizedDays, today);
      return empty;
    }

    const fresh = await this.krxInvestor.fetchInvestorTrading(stockCode, normalizedDays);
    await this.saveCache(company.id, fresh, normalizedDays, today);
    return fresh;
  }

  private async findCompany(idOrName: string) {
    const normalized = this.normalizeName(idOrName);
    return this.companyRepo.findOne({
      where: [{ id: idOrName }, { normalizedName: normalized }, { name: idOrName }],
    });
  }

  private async saveCache(
    companyId: string,
    data: InvestorTradingData,
    days: number,
    fetchedDate: string,
  ) {
    const existing = await this.tradingRepo.findOne({ where: { companyId } });
    const entity = existing ?? this.tradingRepo.create({ id: randomUUID(), companyId });

    entity.stockCode = data.stockCode;
    entity.source = data.source;
    entity.records = JSON.stringify(data.records ?? []);
    entity.days = days;
    entity.fetchedDate = fetchedDate;
    entity.fetchedAt = new Date();
    entity.error = data.error ?? null;

    await this.tradingRepo.save(entity);
  }

  private toData(entity: CompanyInvestorTradingEntity, days: number): InvestorTradingData {
    return {
      stockCode: entity.stockCode,
      records: this.parseRecords(entity.records).slice(0, days),
      source: entity.source,
      error: entity.error ?? undefined,
    };
  }

  private parseRecords(value: string): InvestorTradingRecord[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private normalizeDays(days: number) {
    return Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 120) : 30;
  }

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  private todayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}
