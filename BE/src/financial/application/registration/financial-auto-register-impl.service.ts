import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';

export interface AutoRegisterResult {
  companyId: string;
  name: string;
  stockCode: string;
  created: boolean;
}

@Injectable()
export class FinancialAutoRegisterImplService {
  private readonly logger = new Logger(FinancialAutoRegisterImplService.name);

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
  ) {}

  async register(symbol: string): Promise<AutoRegisterResult | null> {
    const code = this.extractCode(symbol);
    if (!code) return null;

    // 이미 DB에 있으면 바로 반환
    const existing = await this.financialRepo.findOne({
      where: { stockCode: code },
    });
    if (existing) {
      const company = await this.companyRepo.findOne({
        where: { id: existing.companyId },
      });
      return company
        ? {
            companyId: company.id,
            name: company.name,
            stockCode: code,
            created: false,
          }
        : null;
    }

    // Naver에서 기업명 조회
    const naverInfo = await this.fetchNaverBasic(code);
    if (!naverInfo?.name) {
      this.logger.warn(`[auto-register] Naver 기업명 조회 실패 code=${code}`);
      return null;
    }

    const name = naverInfo.name;
    const normalized = this.normalizeName(name);

    // 동일 normalizedName 기업이 이미 있으면 financial만 연결
    let company = await this.companyRepo.findOne({
      where: { normalizedName: normalized },
    });
    let created = false;

    if (!company) {
      company = this.companyRepo.create({
        id: randomUUID(),
        name,
        normalizedName: normalized,
        industry: naverInfo.industry ?? null,
        source: 'stock-auto-register',
        sources: JSON.stringify(['stock-auto-register']),
        companyType: null,
        employees: null,
        homeUrl: null,
        address: null,
        ceoName: null,
        foundedDate: null,
        corpCode: null,
        dartUrl: null,
        evidence: null,
        refreshSkippedAt: null,
      });
      await this.companyRepo.save(company);
      created = true;
      this.logger.log(`[auto-register] 신규 기업 등록: ${name} (${code})`);
    } else {
      this.logger.log(
        `[auto-register] 기존 기업에 stockCode 연결: ${company.name} ← ${code}`,
      );
    }

    await this.financialRepo.save({
      id: randomUUID(),
      companyId: company.id,
      stockCode: code,
      corpClass: null,
      capital: null,
      revenue: null,
      financialSummary: null,
      multiYearFinancials: null,
      disclosures: null,
      employeeDetail: null,
    });

    return { companyId: company.id, name, stockCode: code, created };
  }

  private async fetchNaverBasic(
    code: string,
  ): Promise<{ name: string; industry?: string } | null> {
    try {
      const res = await fetch(
        `https://m.stock.naver.com/api/stock/${code}/basic`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 ResearchAI/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        stockName?: string;
        industryCodeType?: { industryGroupKorName?: string };
      };
      const name = data.stockName?.trim();
      if (!name) return null;
      return {
        name,
        industry: data.industryCodeType?.industryGroupKorName ?? undefined,
      };
    } catch {
      return null;
    }
  }

  private extractCode(symbol: string): string | null {
    const m = symbol
      .trim()
      .toUpperCase()
      .match(/^([0-9A-Z]+)\.K[QS]$/);
    if (m) return m[1].padStart(6, '0');
    // 숫자만인 경우(순수 종목코드)도 허용
    if (/^\d{1,6}$/.test(symbol.trim())) return symbol.trim().padStart(6, '0');
    return null;
  }

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }
}
