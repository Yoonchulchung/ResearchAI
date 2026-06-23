import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Like, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';

export interface CompanyListItem {
  id: string;
  normalizedName: string;
  name: string;
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  address: string | null;
  homeUrl: string | null;
  ceoName: string | null;
  corpCode: string | null;
  stockCode: string | null;
  industry: string | null;
  source: string | null;
  sources: string[];
  hasAnalysis: boolean;
  analysisCompanyKey: string | null;
  analysisUpdatedAt: Date | null;
  analysisSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyStockQuote {
  symbol: string | null;
  stockCode: string | null;
  companyName: string;
  currency: string | null;
  exchangeName: string | null;
  regularMarketPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  marketMetrics: {
    per: number | null;
    pbr: number | null;
    eps: number | null;
    bps: number | null;
    estimatedPer: number | null;
    estimatedEps: number | null;
    dividendYield: number | null;
    dividend: number | null;
    asOf: string | null;
    source: string;
  } | null;
  chart: {
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    volume: number | null;
  }[];
  interval: string;
  source: string;
  fetchedAt: string;
  error?: string;
}

export interface CompanySlimItem {
  id: string;
  name: string;
  companyType: string | null;
}

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly repo: Repository<CompanyEntity>,
    @InjectRepository(CompanyAnalysisEntity)
    private readonly analysisRepo: Repository<CompanyAnalysisEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  private getRepresentativeCategory(industry: string | null | undefined): string {
    if (!industry) return '기타';
    const ind = industry.toLowerCase().replace(/\s/g, '');

    if (
      ind.includes('소프트웨어') ||
      ind.includes('컴퓨터') ||
      ind.includes('정보') ||
      ind.includes('통신') ||
      ind.includes('포털') ||
      ind.includes('it') ||
      ind.includes('프로그래밍') ||
      ind.includes('네트워크') ||
      ind.includes('게임') ||
      ind.includes('인터넷') ||
      ind.includes('플랫폼')
    ) {
      return 'IT / 정보통신';
    }

    if (
      ind.includes('제조') ||
      ind.includes('화학') ||
      ind.includes('철강') ||
      ind.includes('조선') ||
      ind.includes('반도체') ||
      ind.includes('자동차') ||
      ind.includes('부품') ||
      ind.includes('기계') ||
      ind.includes('금속') ||
      ind.includes('장비') ||
      ind.includes('전자제품') ||
      ind.includes('전기') ||
      ind.includes('의류') ||
      ind.includes('식품') ||
      ind.includes('제과') ||
      ind.includes('화장품') ||
      ind.includes('패션')
    ) {
      return '제조 / 생산';
    }

    if (
      ind.includes('금융') ||
      ind.includes('은행') ||
      ind.includes('증권') ||
      ind.includes('보험') ||
      ind.includes('투자') ||
      ind.includes('자산') ||
      ind.includes('카드') ||
      ind.includes('캐피탈')
    ) {
      return '금융 / 보험';
    }

    if (
      ind.includes('바이오') ||
      ind.includes('제약') ||
      ind.includes('의약') ||
      ind.includes('의료') ||
      ind.includes('헬스케어') ||
      ind.includes('병원') ||
      ind.includes('생명공학')
    ) {
      return '바이오 / 제약';
    }

    if (
      ind.includes('유통') ||
      ind.includes('물류') ||
      ind.includes('무역') ||
      ind.includes('도매') ||
      ind.includes('소매') ||
      ind.includes('판매') ||
      ind.includes('상사') ||
      ind.includes('커머스') ||
      ind.includes('쇼핑') ||
      ind.includes('백화점') ||
      ind.includes('마트') ||
      ind.includes('편의점')
    ) {
      return '유통 / 물류 / 무역';
    }

    if (
      ind.includes('건설') ||
      ind.includes('부동산') ||
      ind.includes('토목') ||
      ind.includes('건축') ||
      ind.includes('시공') ||
      ind.includes('개발') && (ind.includes('시행') || ind.includes('공급'))
    ) {
      return '건설 / 부동산';
    }

    if (
      ind.includes('엔터') ||
      ind.includes('미디어') ||
      ind.includes('콘텐츠') ||
      ind.includes('영화') ||
      ind.includes('방송') ||
      ind.includes('출판') ||
      ind.includes('인쇄') ||
      ind.includes('문화') ||
      ind.includes('예술') ||
      ind.includes('여행') ||
      ind.includes('관광') ||
      ind.includes('레저') ||
      ind.includes('호텔')
    ) {
      return '미디어 / 엔터 / 관광';
    }

    if (
      ind.includes('교육') ||
      ind.includes('학원') ||
      ind.includes('학교') ||
      ind.includes('대학')
    ) {
      return '교육 / 학술';
    }

    if (
      ind.includes('에너지') ||
      ind.includes('환경') ||
      ind.includes('발전') ||
      ind.includes('가스') ||
      ind.includes('전력') ||
      ind.includes('자원') ||
      ind.includes('정유') ||
      ind.includes('유전')
    ) {
      return '에너지 / 환경';
    }

    if (
      ind.includes('경영') ||
      ind.includes('컨설팅') ||
      ind.includes('광고') ||
      ind.includes('디자인') ||
      ind.includes('법률') ||
      ind.includes('회계') ||
      ind.includes('세무') ||
      ind.includes('번역') ||
      ind.includes('서비스') ||
      ind.includes('인력') ||
      ind.includes('헤드헌팅') ||
      ind.includes('시설') ||
      ind.includes('연구') ||
      ind.includes('공공') ||
      ind.includes('단체')
    ) {
      return '경영 / 서비스';
    }

    return '기타';
  }

  parseSources(raw: string | null): string[] {
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [raw];
    }
  }

  addSource(entity: CompanyEntity, source: string): void {
    const list = this.parseSources(entity.sources);
    if (!list.includes(source)) {
      entity.sources = JSON.stringify([...list, source]);
    }
    if (!entity.source) entity.source = source;
  }

  async listCompaniesSlim(
    options: {
      hasAnalysis?: boolean;
      limit?: number;
    } = {},
  ): Promise<CompanySlimItem[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 300, 1000));

    if (options.hasAnalysis === true) {
      const rows = await this.dataSource.query<
        { id: string; name: string; company_type: string | null }[]
      >(
        `SELECT c.id, c.name, c.company_type
         FROM companies c
         INNER JOIN company_analyses ca ON (ca.company_id = c.id OR ca.company_key = c.normalized_name)
         GROUP BY c.id, c.name, c.company_type
         ORDER BY MAX(ca.updated_at) DESC
         LIMIT ?`,
        [limit],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        companyType: r.company_type,
      }));
    }

    const companies = await this.repo.find({
      select: ['id', 'name', 'companyType'],
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      companyType: c.companyType,
    }));
  }

  async listCompanies(
    options: {
      q?: string;
      hasAnalysis?: boolean;
      limit?: number;
      industry?: string;
    } = {},
  ): Promise<CompanyListItem[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 300, 1000));
    const where = options.q?.trim()
      ? [
          { name: Like(`%${options.q.trim()}%`) },
          { normalizedName: Like(`%${this.normalizeName(options.q)}%`) },
        ]
      : undefined;

    const fetchLimit = options.industry ? 1000 : limit;
    const companies = await this.repo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: fetchLimit,
    });

    if (companies.length === 0) return [];

    const [analyses, financials] = await Promise.all([
      this.analysisRepo.find({
        where: [
          ...(companies.length
            ? [{ companyId: In(companies.map((company) => company.id)) }]
            : []),
          ...(companies.length
            ? [
                {
                  companyKey: In(
                    companies.map((company) => company.normalizedName),
                  ),
                },
              ]
            : []),
        ],
        order: { updatedAt: 'DESC' },
      }),
      this.financialRepo.find({
        where: [
          ...(companies.length
            ? [{ companyId: In(companies.map((company) => company.id)) }]
            : []),
        ],
      }),
    ]);

    const byCompanyId = new Map<string, CompanyAnalysisEntity>();
    const byCompanyKey = new Map<string, CompanyAnalysisEntity>();
    for (const analysis of analyses) {
      if (analysis.companyId && !byCompanyId.has(analysis.companyId))
        byCompanyId.set(analysis.companyId, analysis);
      if (analysis.companyKey && !byCompanyKey.has(analysis.companyKey))
        byCompanyKey.set(analysis.companyKey, analysis);
    }

    const financialsMap = new Map<string, string>();
    for (const f of financials) {
      if (f.companyId && f.stockCode) {
        financialsMap.set(f.companyId, f.stockCode);
      }
    }

    let items = companies.map((company) => {
      const analysis =
        byCompanyId.get(company.id) ??
        byCompanyKey.get(company.normalizedName) ??
        null;
      const stockCode = financialsMap.get(company.id) ?? null;
      return this.toListItem(company, analysis, stockCode);
    });

    if (typeof options.hasAnalysis === 'boolean') {
      items = items.filter((item) => item.hasAnalysis === options.hasAnalysis);
    }

    if (options.industry) {
      const selectedCats = options.industry
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (selectedCats.length > 0) {
        items = items.filter((item) =>
          selectedCats.includes(this.getRepresentativeCategory(item.industry)),
        );
      }
      items = items.slice(0, limit);
    }

    return items;
  }

  async findStockCode(idOrName: string): Promise<string | null> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) return null;
    const financial = await this.financialRepo.findOne({
      where: { companyId: company.id },
    });
    return financial?.stockCode?.trim() || null;
  }

  async findCompany(idOrName: string): Promise<CompanyListItem | null> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) return null;
    const [analysis, financial] = await Promise.all([
      this.analysisRepo.findOne({
        where: [
          { companyId: company.id },
          { companyKey: company.normalizedName },
        ],
        order: { updatedAt: 'DESC' },
      }),
      this.financialRepo.findOne({
        where: { companyId: company.id },
      }),
    ]);
    return this.toListItem(
      company,
      analysis ?? null,
      financial?.stockCode ?? null,
    );
  }

  async getMissingStats(): Promise<{
    total: number;
    missingCompanyType: number;
    missingEmployees: number;
  }> {
    const [total, missingCompanyType, missingEmployees] = await Promise.all([
      this.repo.count(),
      this.repo.count({ where: { companyType: IsNull() } }),
      this.repo.count({ where: { employees: IsNull() } }),
    ]);
    return { total, missingCompanyType, missingEmployees };
  }

  async findMissingTypeCompanyIds(): Promise<string[]> {
    const companies = await this.repo.find({
      select: ['id'],
      where: { companyType: IsNull(), refreshSkippedAt: IsNull() },
    });
    return companies.map((c) => c.id);
  }

  async findMissingTypeCompanies(): Promise<{ id: string; name: string }[]> {
    const companies = await this.repo.find({
      select: ['id', 'name'],
      where: { companyType: IsNull(), refreshSkippedAt: IsNull() },
    });
    return companies.map((c) => ({ id: c.id, name: c.name }));
  }

  async findByName(companyName: string): Promise<CompanyEntity | null> {
    const normalized = this.normalizeName(companyName);
    return this.repo.findOne({ where: { normalizedName: normalized } });
  }

  async patchFromAnalysis(
    companyId: string,
    fields: Partial<
      Pick<
        CompanyEntity,
        | 'homeUrl'
        | 'address'
        | 'dartUrl'
        | 'ceoName'
        | 'foundedDate'
        | 'industry'
      >
    >,
  ): Promise<void> {
    const entity = await this.repo.findOne({ where: { id: companyId } });
    if (!entity) return;
    let changed = false;
    for (const [k, v] of Object.entries(fields) as [
      keyof typeof fields,
      string | null,
    ][]) {
      if (v && !entity[k]) {
        (entity as unknown as Record<string, unknown>)[k] = v;
        changed = true;
      }
    }
    if (changed) {
      this.addSource(entity, 'dart');
      await this.repo.save(entity);
    }
  }

  async upsertFinancial(
    companyId: string,
    data: Partial<{
      stockCode: string | null;
      corpClass: string | null;
      capital: string | null;
      revenue: string | null;
      financialSummary: string | null;
      multiYearFinancials: string | null;
      disclosures: string | null;
      employeeDetail: string | null;
    }>,
  ): Promise<void> {
    const existing = await this.financialRepo.findOne({ where: { companyId } });
    await this.financialRepo.save({
      ...(existing ?? {}),
      id: existing?.id ?? randomUUID(),
      companyId,
      ...data,
    });
  }

  toListItem(
    company: CompanyEntity,
    analysis: CompanyAnalysisEntity | null,
    stockCode: string | null = null,
  ): CompanyListItem {
    return {
      id: company.id,
      normalizedName: company.normalizedName,
      name: company.name,
      companyType: company.companyType,
      employees: company.employees,
      foundedDate: company.foundedDate,
      address: company.address,
      homeUrl: company.homeUrl,
      ceoName: company.ceoName,
      corpCode: company.corpCode,
      stockCode: stockCode ?? null,
      industry: company.industry ?? null,
      source: company.source,
      sources: this.parseSources(company.sources),
      hasAnalysis: Boolean(analysis),
      analysisCompanyKey: analysis?.companyKey ?? null,
      analysisUpdatedAt: analysis?.updatedAt ?? null,
      analysisSummary: analysis?.summary ?? null,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}
