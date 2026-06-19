import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import {
  CompanyAnalysisProgress,
  CompanyAnalysisDto,
} from 'src/company/domain/company-analysis.types';
import { YearlyFinancial } from 'src/company/infrastructure/dart/dart-types';
import { normalizeKey, toDto } from './company-analysis.utils';
import { CompanyAnalysisChatService } from './company-analysis-chat.service';
import { CompanyAnalysisPipelineService } from './company-analysis-pipeline.service';

@Injectable()
export class CompanyAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(CompanyAnalysisService.name);

  constructor(
    @InjectRepository(CompanyAnalysisEntity)
    private readonly repo: Repository<CompanyAnalysisEntity>,
    @InjectRepository(CompanyRateEntity)
    private readonly rateRepo: Repository<CompanyRateEntity>,
    private readonly dataSource: DataSource,
    private readonly chat: CompanyAnalysisChatService,
    private readonly pipeline: CompanyAnalysisPipelineService,
  ) {}

  async onModuleInit() {
    await this.migrateJobplanetSummaryToRate();
  }

  private async migrateJobplanetSummaryToRate() {
    try {
      const rows = await this.dataSource.query(
        `SELECT company_key, company_name, jobplanet_summary FROM company_analyses WHERE jobplanet_summary IS NOT NULL`,
      );
      if (!rows.length) return;
      for (const row of rows) {
        const exists = await this.rateRepo.findOne({
          where: { companyKey: row.company_key },
        });
        if (!exists) {
          await this.rateRepo.save({
            id: randomUUID(),
            companyKey: row.company_key,
            companyName: row.company_name,
            source: 'jobplanet',
            summary: row.jobplanet_summary,
            overallRating: null,
            reviewCount: null,
            welfare: null,
            cultureRating: null,
            wlbRating: null,
            reviews: null,
          });
        }
      }
      this.logger.log(
        `[CompanyRate] 잡플래닛 요약 ${rows.length}건 마이그레이션 완료`,
      );
    } catch {
      // jobplanet_summary 컬럼이 이미 없으면 무시
    }
  }

  async findAll(): Promise<CompanyAnalysisDto[]> {
    const rows = await this.repo.find({
      order: { updatedAt: 'DESC' },
      relations: ['company', 'company.financial'],
    });
    const keys = rows.map((r) => r.companyKey);
    const rates = keys.length
      ? await this.rateRepo.find({
          where: keys.map((k) => ({ companyKey: k })),
        })
      : [];
    const rateMap = new Map(rates.map((r) => [r.companyKey, r]));
    return rows.map((r) => toDto(r, rateMap.get(r.companyKey) ?? null));
  }

  async findByKey(companyKey: string): Promise<CompanyAnalysisDto> {
    const row = await this.repo.findOne({
      where: { companyKey },
      relations: ['company', 'company.financial'],
    });
    if (!row) throw new NotFoundException(`기업 분석 결과 없음: ${companyKey}`);
    const rate = await this.rateRepo.findOne({ where: { companyKey } });
    const dto = toDto(row, rate ?? null);
    await this.enrichDtoWithNaverFinancials(dto);
    return dto;
  }

  async findByName(companyName: string): Promise<CompanyAnalysisDto | null> {
    const key = normalizeKey(companyName);
    const row = await this.repo.findOne({
      where: { companyKey: key },
      relations: ['company', 'company.financial'],
    });
    if (!row) return null;
    const rate = await this.rateRepo.findOne({ where: { companyKey: key } });
    const dto = toDto(row, rate ?? null);
    await this.enrichDtoWithNaverFinancials(dto);
    return dto;
  }

  async delete(companyKey: string): Promise<void> {
    await this.repo.delete({ companyKey });
  }

  async buildChatContext(companyKey: string): Promise<string> {
    const row = await this.repo.findOne({
      where: { companyKey },
      relations: ['company', 'company.financial'],
    });
    if (!row) throw new NotFoundException(`기업 분석 결과 없음: ${companyKey}`);
    const rate = await this.rateRepo.findOne({ where: { companyKey } });
    return this.chat.formatChatContext(toDto(row, rate ?? null), row.sourceContext);
  }

  async *analyzeStream(
    companyName: string,
    aiModel: string,
    signal?: AbortSignal,
  ): AsyncGenerator<CompanyAnalysisProgress> {
    yield* this.pipeline.analyzeStream(companyName, aiModel, signal);
  }

  private async enrichDtoWithNaverFinancials(
    dto: CompanyAnalysisDto,
  ): Promise<void> {
    const stockCode = dto.stockCode;
    if (!stockCode?.trim()) return;

    try {
      const code = stockCode.replace(/\D/g, '').padStart(6, '0');
      const res = await fetch(
        `https://finance.naver.com/item/main.naver?code=${code}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) return;

      const buffer = await res.arrayBuffer();
      const html = new TextDecoder('euc-kr').decode(buffer);

      const tableMatch = html.match(
        /<table summary="기업실적분석[\s\S]*?<\/table>/i,
      );
      if (!tableMatch) return;
      const tableHtml = tableMatch[0];

      const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i);
      const years: number[] = [];
      if (theadMatch) {
        const thMatches =
          theadMatch[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/gi) ?? [];
        for (const th of thMatches) {
          const yearText = th
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .trim();
          const m = yearText.match(/^(20\d{2})/);
          if (m) {
            years.push(parseInt(m[1], 10));
            if (years.length === 4) break;
          }
        }
      }
      if (years.length === 0) return;

      const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
      const rowMap = new Map<string, string[]>();
      if (tbodyMatch) {
        const trMatches =
          tbodyMatch[1].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
        for (const tr of trMatches) {
          const cellMatches =
            tr.match(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi) ?? [];
          if (cellMatches.length < 5) continue;
          const firstCell = cellMatches[0];
          if (!firstCell) continue;
          const label = firstCell
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s/g, '');
          const values = cellMatches.slice(1, 5).map((c) =>
            c
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/,/g, '')
              .trim(),
          );
          rowMap.set(label, values);
        }
      }

      const parseNum = (val?: string): number | null => {
        if (!val || val === '-' || val === '') return null;
        const n = parseFloat(val);
        return isNaN(n) ? null : n;
      };

      if (dto.multiYearFinancials?.length) {
        const sorted = dto.multiYearFinancials;
        for (let i = 0; i < sorted.length; i++) {
          const d = sorted[i] as YearlyFinancial & {
            reserveRatio?: number | null;
            eps?: number | null;
            bps?: number | null;
            per?: number | null;
            pbr?: number | null;
            roe?: number | null;
            roa?: number | null;
            dividend?: number | null;
            dividendYield?: number | null;
            dividendPayoutRatio?: number | null;
            sps?: number | null;
            cps?: number | null;
            psr?: number | null;
            pcr?: number | null;
          };
          const prev = sorted[i - 1] ?? null;
          const yearIdx = years.indexOf(d.year);
          if (yearIdx !== -1) {
            d.reserveRatio = parseNum(rowMap.get('유보율')?.[yearIdx]);
            d.eps = parseNum(rowMap.get('EPS(원)')?.[yearIdx]);
            d.bps = parseNum(rowMap.get('BPS(원)')?.[yearIdx]);
            d.per = parseNum(rowMap.get('PER(배)')?.[yearIdx]);
            d.pbr = parseNum(rowMap.get('PBR(배)')?.[yearIdx]);
            d.roe =
              parseNum(rowMap.get('ROE(지배주주)')?.[yearIdx]) ??
              parseNum(rowMap.get('ROE')?.[yearIdx]);
            d.dividend = parseNum(rowMap.get('주당배당금(원)')?.[yearIdx]);
            d.dividendYield = parseNum(rowMap.get('시가배당률(%)')?.[yearIdx]);
            d.dividendPayoutRatio = parseNum(
              rowMap.get('배당성향(%)')?.[yearIdx],
            );
          }

          if (d.reserveRatio == null && d.totalEquity && d.capitalAmount) {
            d.reserveRatio =
              ((d.totalEquity - d.capitalAmount) / d.capitalAmount) * 100;
          }
          if (d.netIncome && d.totalAssets) {
            const avgAssets =
              prev && prev.totalAssets
                ? (prev.totalAssets + d.totalAssets) / 2
                : d.totalAssets;
            d.roa = (d.netIncome / avgAssets) * 100;
          }
          if (d.roe == null && d.netIncome && d.totalEquity) {
            const avgEquity =
              prev && prev.totalEquity
                ? (prev.totalEquity + d.totalEquity) / 2
                : d.totalEquity;
            d.roe = (d.netIncome / avgEquity) * 100;
          }
          if (d.bps && d.totalEquity && d.totalEquity > 0) {
            const sps =
              d.revenue && d.totalEquity
                ? (d.revenue / d.totalEquity) * d.bps
                : null;
            d.sps = sps;
            const cps =
              d.operatingCashFlow && d.totalEquity
                ? (d.operatingCashFlow / d.totalEquity) * d.bps
                : null;
            d.cps = cps;
            if (d.pbr) {
              d.psr = sps ? (d.pbr * d.bps) / sps : null;
              d.pcr = cps ? (d.pbr * d.bps) / cps : null;
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(`[Naver Finance Scraper] 오류: ${(err as Error).message}`);
    }
  }
}
