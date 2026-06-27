import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  In,
  IsNull,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import type {
  CompanyListItem,
  CompanySlimItem,
} from 'src/company/application/company.service';

@Injectable()
export class CompanyRegistryService {
  private readonly industryCategoryKeywords: Record<string, string[]> = {
    'IT / 정보통신': [
      '소프트웨어',
      '컴퓨터',
      '정보',
      '통신',
      '포털',
      'it',
      '프로그래밍',
      '네트워크',
      '게임',
      '인터넷',
      '플랫폼',
    ],
    '제조 / 생산': [
      '제조',
      '화학',
      '철강',
      '조선',
      '반도체',
      '자동차',
      '부품',
      '기계',
      '금속',
      '장비',
      '전자제품',
      '전기',
      '의류',
      '식품',
      '제과',
      '화장품',
      '패션',
    ],
    '금융 / 보험': [
      '금융',
      '은행',
      '증권',
      '보험',
      '투자',
      '자산',
      '카드',
      '캐피탈',
    ],
    '바이오 / 제약': [
      '바이오',
      '제약',
      '의약',
      '의료',
      '헬스케어',
      '병원',
      '생명공학',
    ],
    '유통 / 물류 / 무역': [
      '유통',
      '물류',
      '무역',
      '도매',
      '소매',
      '판매',
      '상사',
      '커머스',
      '쇼핑',
      '백화점',
      '마트',
      '편의점',
    ],
    '건설 / 부동산': ['건설', '부동산', '토목', '건축', '시공'],
    '미디어 / 엔터 / 관광': [
      '엔터',
      '미디어',
      '콘텐츠',
      '영화',
      '방송',
      '출판',
      '인쇄',
      '문화',
      '예술',
      '여행',
      '관광',
      '레저',
      '호텔',
    ],
    '교육 / 학술': ['교육', '학원', '학교', '대학'],
    '에너지 / 환경': [
      '에너지',
      '환경',
      '발전',
      '가스',
      '전력',
      '자원',
      '정유',
      '유전',
    ],
    '경영 / 서비스': [
      '경영',
      '컨설팅',
      '광고',
      '디자인',
      '법률',
      '회계',
      '세무',
      '번역',
      '서비스',
      '인력',
      '헤드헌팅',
      '시설',
      '연구',
      '공공',
      '단체',
    ],
  };

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

  private normalizeIndustryKeyword(keyword: string): string {
    return keyword.toLowerCase().replace(/\s/g, '');
  }

  private getRepresentativeCategory(
    industry: string | null | undefined,
  ): string {
    if (!industry) return '기타';
    const ind = industry.toLowerCase().replace(/\s/g, '');

    for (const [category, keywords] of Object.entries(
      this.industryCategoryKeywords,
    )) {
      if (
        keywords.some((keyword) =>
          ind.includes(this.normalizeIndustryKeyword(keyword)),
        )
      ) {
        return category;
      }
    }

    return '기타';
  }

  private applyIndustryCategoryFilter(
    qb: SelectQueryBuilder<CompanyEntity>,
    rawIndustry: string | undefined,
  ): void {
    const categories = rawIndustry
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!categories?.length) return;
    const selectedCategories = categories.filter(
      (category) =>
        category === '기타' ||
        !!this.industryCategoryKeywords[category]?.length,
    );
    if (selectedCategories.length === 0) return;

    const industryExpr = "LOWER(REPLACE(company.industry, ' ', ''))";
    const allKeywords = [
      ...new Set(Object.values(this.industryCategoryKeywords).flat()),
    ].map((keyword) => this.normalizeIndustryKeyword(keyword));

    qb.andWhere(
      new Brackets((categoryQb) => {
        let hasCondition = false;
        const append = (sql: string, params: Record<string, string>) => {
          if (hasCondition) categoryQb.orWhere(sql, params);
          else categoryQb.where(sql, params);
          hasCondition = true;
        };

        selectedCategories.forEach((category, categoryIndex) => {
          if (category === '기타') {
            const params: Record<string, string> = {};
            const notLike = allKeywords
              .map((keyword, keywordIndex) => {
                const key = `industryOther${categoryIndex}_${keywordIndex}`;
                params[key] = `%${keyword}%`;
                return `${industryExpr} NOT LIKE :${key}`;
              })
              .join(' AND ');
            append(
              `(company.industry IS NULL OR (${industryExpr} IS NOT NULL AND ${notLike}))`,
              params,
            );
            return;
          }

          const keywords = this.industryCategoryKeywords[category];
          if (!keywords?.length) return;

          const params: Record<string, string> = {};
          const like = keywords
            .map((keyword, keywordIndex) => {
              const key = `industry${categoryIndex}_${keywordIndex}`;
              params[key] = `%${this.normalizeIndustryKeyword(keyword)}%`;
              return `${industryExpr} LIKE :${key}`;
            })
            .join(' OR ');
          append(`(${like})`, params);
        });
      }),
    );
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
    const qb = this.repo
      .createQueryBuilder('company')
      .orderBy('company.updated_at', 'DESC')
      .take(limit);
    const q = options.q?.trim();

    if (q) {
      qb.andWhere(
        new Brackets((whereQb) => {
          whereQb
            .where('company.name LIKE :q', { q: `%${q}%` })
            .orWhere('company.normalized_name LIKE :normalizedQ', {
              normalizedQ: `%${this.normalizeName(q)}%`,
            });
        }),
      );
    }

    if (typeof options.hasAnalysis === 'boolean') {
      const analysisExists = `
        EXISTS (
          SELECT 1
          FROM company_analyses ca
          WHERE ca.company_id = company.id
             OR ca.company_key = company.normalized_name
        )
      `;
      qb.andWhere(
        options.hasAnalysis ? analysisExists : `NOT ${analysisExists}`,
      );
    }

    this.applyIndustryCategoryFilter(qb, options.industry);

    const companies = await qb.getMany();

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

    const items = companies.map((company) => {
      const analysis =
        byCompanyId.get(company.id) ??
        byCompanyKey.get(company.normalizedName) ??
        null;
      const stockCode = financialsMap.get(company.id) ?? null;
      return this.toListItem(company, analysis, stockCode);
    });

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
