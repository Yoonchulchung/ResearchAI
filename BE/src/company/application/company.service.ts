import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Like, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyAnalysisEntity } from '../domain/entity/company-analysis.entity';
import { CompanyEntity } from '../domain/entity/company.entity';
import { CompanyFinancialEntity } from '../domain/entity/company-financial.entity';
import { CompanyRateEntity } from '../domain/entity/company-rate.entity';
import { DartFinancialService } from '../infrastructure/dart-financial.service';
import { NamuWikiService } from '../infrastructure/namu-wiki.service';
import { JasoseolCompanyService } from '../infrastructure/jasoseol-company.service';
import { JobkoreaCompanyService } from '../infrastructure/jobkorea-company.service';
import { JobplanetInfoService } from '../infrastructure/jobplanet-info.service';

// 우선순위: dart > namu-wiki > jobkorea > jasoseol > jobplanet > jobSite > manual
const SOURCE_PRIORITY: Record<string, number> = {
  dart: 100,
  'namu-wiki': 80,
  jobkorea: 70,
  jasoseol: 60,
  jobplanet: 55,
  'jobplanet-info': 50,
  jobSite: 30,
  manual: 10,
};

interface EnrichResult {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  address: string | null;
  homeUrl: string | null;
  ceoName: string | null;
  corpCode: string | null;
  industry: string | null;
  dartUrl: string | null;
  source: string;
}

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

export interface CompanySlimItem {
  id: string;
  name: string;
  companyType: string | null;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly repo: Repository<CompanyEntity>,
    @InjectRepository(CompanyRateEntity)
    private readonly rateRepo: Repository<CompanyRateEntity>,
    @InjectRepository(CompanyAnalysisEntity)
    private readonly analysisRepo: Repository<CompanyAnalysisEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
    private readonly dartFinancial: DartFinancialService,
    private readonly namuWiki: NamuWikiService,
    private readonly jasoseol: JasoseolCompanyService,
    private readonly jobkorea: JobkoreaCompanyService,
    private readonly jobplanetInfo: JobplanetInfoService,
    private readonly dataSource: DataSource,
  ) {}

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  async listCompaniesSlim(options: {
    hasAnalysis?: boolean;
    limit?: number;
  } = {}): Promise<CompanySlimItem[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 300, 1000));

    if (options.hasAnalysis === true) {
      const rows = await this.dataSource.query<{ id: string; name: string; company_type: string | null }[]>(
        `SELECT c.id, c.name, c.company_type
         FROM companies c
         INNER JOIN company_analyses ca ON (ca.company_id = c.id OR ca.company_key = c.normalized_name)
         GROUP BY c.id, c.name, c.company_type
         ORDER BY MAX(ca.updated_at) DESC
         LIMIT ?`,
        [limit],
      );
      return rows.map((r) => ({ id: r.id, name: r.name, companyType: r.company_type }));
    }

    const companies = await this.repo.find({
      select: ['id', 'name', 'companyType'],
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    return companies.map((c) => ({ id: c.id, name: c.name, companyType: c.companyType }));
  }

  async listCompanies(options: {
    q?: string;
    hasAnalysis?: boolean;
    limit?: number;
  } = {}): Promise<CompanyListItem[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 300, 1000));
    const where = options.q?.trim()
      ? [{ name: Like(`%${options.q.trim()}%`) }, { normalizedName: Like(`%${this.normalizeName(options.q)}%`) }]
      : undefined;

    const companies = await this.repo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    if (companies.length === 0) return [];

    const analyses = await this.analysisRepo.find({
      where: [
        ...(companies.length ? [{ companyId: In(companies.map((company) => company.id)) }] : []),
        ...(companies.length ? [{ companyKey: In(companies.map((company) => company.normalizedName)) }] : []),
      ],
      order: { updatedAt: 'DESC' },
    });

    const byCompanyId = new Map<string, CompanyAnalysisEntity>();
    const byCompanyKey = new Map<string, CompanyAnalysisEntity>();
    for (const analysis of analyses) {
      if (analysis.companyId && !byCompanyId.has(analysis.companyId)) byCompanyId.set(analysis.companyId, analysis);
      if (analysis.companyKey && !byCompanyKey.has(analysis.companyKey)) byCompanyKey.set(analysis.companyKey, analysis);
    }

    const items = companies.map((company) => {
      const analysis = byCompanyId.get(company.id) ?? byCompanyKey.get(company.normalizedName) ?? null;
      return this.toListItem(company, analysis);
    });

    return typeof options.hasAnalysis === 'boolean'
      ? items.filter((item) => item.hasAnalysis === options.hasAnalysis)
      : items;
  }

  async findCompany(idOrName: string): Promise<CompanyListItem | null> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [{ id: idOrName }, { normalizedName: normalized }, { name: idOrName }],
    });
    if (!company) return null;

    const analysis = await this.analysisRepo.findOne({
      where: [{ companyId: company.id }, { companyKey: company.normalizedName }],
      order: { updatedAt: 'DESC' },
    });
    return this.toListItem(company, analysis ?? null);
  }

  async refreshMissing(idOrName: string, { force = false, signal }: { force?: boolean; signal?: AbortSignal } = {}): Promise<CompanyListItem> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [{ id: idOrName }, { normalizedName: normalized }, { name: idOrName }],
    });
    if (!company) {
      throw new NotFoundException('기업을 찾을 수 없습니다.');
    }

    const results = await this.fetchAllSources(company.name, company.normalizedName, { force, signal });
    const merged = this.mergeSources(results, null, null);

    let changed = false;
    const fill = <K extends keyof CompanyEntity>(key: K, value: CompanyEntity[K]) => {
      if (!company[key] && value) {
        company[key] = value;
        changed = true;
      }
    };

    fill('companyType', merged.companyType);
    fill('employees', merged.employees);
    fill('homeUrl', merged.homeUrl);
    fill('address', merged.address);
    fill('ceoName', merged.ceoName);
    fill('corpCode', merged.corpCode);
    fill('foundedDate', merged.foundedDate);

    if (!company.source && merged.source) {
      company.source = merged.source;
      changed = true;
    }

    const existingSources = this.parseSources(company.sources);
    const collectedSources = this.parseSources(merged.sources);
    const nextSources = [...new Set([...existingSources, ...collectedSources])];
    if (nextSources.length !== existingSources.length) {
      company.sources = JSON.stringify(nextSources);
      changed = true;
    }

    if (force && !company.companyType) {
      company.refreshSkippedAt = new Date();
      changed = true;
    }

    if (changed) {
      await this.repo.save(company);
    }

    const analysis = await this.analysisRepo.findOne({
      where: [{ companyId: company.id }, { companyKey: company.normalizedName }],
      order: { updatedAt: 'DESC' },
    });
    return this.toListItem(company, analysis ?? null);
  }

  async findOrCreate(
    companyName: string,
    knownType?: string | null,
    knownEmployees?: string | null,
    signal?: AbortSignal,
  ): Promise<CompanyEntity | null> {
    if (!companyName?.trim()) return null;

    const normalized = this.normalizeName(companyName);
    const existing = await this.repo.findOne({ where: { normalizedName: normalized } });

    if (existing) {
      if (existing.source !== 'dart') {
        return this.enrich(existing, knownType ?? null, knownEmployees ?? null, signal);
      }
      let changed = false;
      if (!existing.companyType && knownType) {
        existing.companyType = knownType;
        this.addSource(existing, 'jobSite');
        changed = true;
      }
      if (!existing.employees && knownEmployees) {
        existing.employees = knownEmployees;
        this.addSource(existing, 'jobSite');
        changed = true;
      }
      if (changed) await this.repo.save(existing);
      return existing;
    }

    return this.createNew(companyName, normalized, knownType ?? null, knownEmployees ?? null, signal);
  }

  // ── 신규 생성 ──────────────────────────────────────────────────────────

  private async createNew(
    companyName: string,
    normalizedName: string,
    knownType: string | null,
    knownEmployees: string | null = null,
    signal?: AbortSignal,
  ): Promise<CompanyEntity | null> {
    const results = await this.fetchAllSources(companyName, normalizedName, { signal });
    const merged = this.mergeSources(results, knownType, knownEmployees);

    const entity = this.repo.create({
      ...merged,
      id: randomUUID(),
      normalizedName,
      name: companyName,
    });

    try {
      await this.repo.save(entity);
      this.logger.log(`[Company] 저장 — "${companyName}" (type: ${entity.companyType ?? 'null'}, sources: ${entity.sources})`);
      return entity;
    } catch {
      return await this.repo.findOne({ where: { normalizedName } }) ?? null;
    }
  }

  // ── 기존 레코드 보완 ───────────────────────────────────────────────────

  private async enrich(entity: CompanyEntity, knownType: string | null, knownEmployees: string | null = null, signal?: AbortSignal): Promise<CompanyEntity> {
    const results = await this.fetchAllSources(entity.name, this.normalizeName(entity.name), { signal });
    const merged = this.mergeSources(results, knownType, knownEmployees);

    // 기존값이 더 신뢰도 높은 소스에서 온 경우 유지
    const existingPriority = SOURCE_PRIORITY[entity.source ?? 'manual'] ?? 0;
    const newPriority = SOURCE_PRIORITY[merged.source ?? 'manual'] ?? 0;

    if (merged.companyType && (!entity.companyType || newPriority >= existingPriority)) {
      entity.companyType = merged.companyType;
      entity.source = merged.source;
    }
    // 빈 필드는 새 데이터로 보완
    if (!entity.employees && merged.employees) entity.employees = merged.employees;
    if (!entity.homeUrl && merged.homeUrl) entity.homeUrl = merged.homeUrl;
    if (!entity.address && merged.address) entity.address = merged.address;
    if (!entity.ceoName && merged.ceoName) entity.ceoName = merged.ceoName;
    if (!entity.corpCode && merged.corpCode) entity.corpCode = merged.corpCode;
    if (!entity.foundedDate && merged.foundedDate) entity.foundedDate = merged.foundedDate;
    if (!entity.industry && merged.industry) entity.industry = merged.industry;
    if (!entity.dartUrl && merged.dartUrl) entity.dartUrl = merged.dartUrl;

    // sources 배열 통합
    const existing = this.parseSources(entity.sources);
    const added = this.parseSources(merged.sources);
    entity.sources = JSON.stringify([...new Set([...existing, ...added])]);

    await this.repo.save(entity);
    this.logger.log(`[Company] 보완 — "${entity.name}" (type: ${entity.companyType ?? 'null'}, sources: ${entity.sources})`);
    return entity;
  }

  // ── 전체 소스 조회 ─────────────────────────────────────────────────────

  private cleanSearchName(name: string): string {
    const cleaned = name
      .replace(/\(주\)|㈜|\(유\)|㈔|주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/gi, '')
      .replace(/[\s()（）\[\]]/g, '')
      .trim();
    return cleaned || name;
  }

  private inferTypeFromName(name: string): string | null {
    if (/병원|의원|클리닉|한의원|요양원|치과/.test(name)) return '병원';
    if (/학교|대학교|대학원|초등학교|중학교|고등학교|유치원|어린이집/.test(name)) return '학교';
    if (/공단|공사|공기업|지방공기업/.test(name)) return '공공기관';
    if (/재단법인|사단법인|재단|협회|연구원|연구소/.test(name)) return '공공기관';
    return null;
  }

  private async fetchAllSources(
    companyName: string,
    companyKey: string,
    { force = false, signal }: { force?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ source: string; result: Partial<EnrichResult> }[]> {
    const searchName = this.cleanSearchName(companyName);
    const dartApiKey = await this.getDartApiKey();
    const collected: { source: string; result: Partial<EnrichResult> }[] = [];

    // 0순위: 기업명 자체에서 타입 추론 (즉시)
    const nameType = this.inferTypeFromName(companyName);
    if (nameType) {
      collected.push({ source: 'name-inference', result: { companyType: nameType } });
    }

    // 1~6순위: 모든 외부 소스 병렬 실행
    const abort = <T>(p: Promise<T>): Promise<T> => {
      if (!signal) return p;
      if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    };

    const [dartR, wikiR, jkR, jasR, jpInfoR, jpCacheR] = await Promise.allSettled([
      // DART
      abort(dartApiKey
        ? this.dartFinancial.fetchCompanyData(searchName, dartApiKey)
        : Promise.resolve(null)),
      // 나무위키
      abort(this.namuWiki.fetchCompanyInfo(searchName, { force })),
      // 잡코리아
      abort(this.jobkorea.fetchCompanyInfo(searchName, { force })),
      // 자소설닷컴
      abort(this.jasoseol.fetchCompanyInfo(searchName, { force })),
      // 잡플래닛 (공개 기업정보)
      abort(this.jobplanetInfo.fetchCompanyInfo(searchName, { force })),
      // 잡플래닛 캐시 (기존 리뷰 데이터)
      abort(this.inferFromJobplanetCache(companyKey)),
    ]);

    if (dartR.status === 'fulfilled' && dartR.value) {
      const dartData = dartR.value;
      const companyType = this.inferCompanyType(dartData.corpClass, dartData.stockCode, dartData.employees);
      collected.push({
        source: 'dart',
        result: {
          companyType,
          employees: dartData.employees,
          homeUrl: dartData.homeUrl,
          address: dartData.address,
          ceoName: dartData.ceoName,
          foundedDate: dartData.foundedDate,
          corpCode: dartData.corpCode,
          dartUrl: dartData.dartUrl,
        },
      });
    } else if (dartR.status === 'rejected') {
      this.logger.warn(`[Company] DART 실패 — "${companyName}": ${dartR.reason}`);
    }

    if (wikiR.status === 'fulfilled' && wikiR.value) {
      const wiki = wikiR.value;
      collected.push({
        source: 'namu-wiki',
        result: { companyType: wiki.companyType, employees: wiki.employees, foundedDate: wiki.foundedDate },
      });
    }

    if (jkR.status === 'fulfilled' && jkR.value) {
      const jk = jkR.value;
      collected.push({
        source: 'jobkorea',
        result: {
          companyType: jk.companyType,
          employees: jk.employees,
          foundedDate: jk.foundedDate,
          address: jk.address,
          homeUrl: jk.homeUrl,
          industry: jk.industry,
        },
      });
    }

    if (jasR.status === 'fulfilled' && jasR.value) {
      const jas = jasR.value;
      collected.push({
        source: 'jasoseol',
        result: {
          companyType: jas.companyType,
          employees: jas.employees,
          foundedDate: jas.foundedDate,
          address: jas.address,
          industry: jas.industry,
        },
      });
    }

    if (jpInfoR.status === 'fulfilled' && jpInfoR.value) {
      const jp = jpInfoR.value;
      collected.push({
        source: 'jobplanet-info',
        result: { companyType: jp.companyType, employees: jp.employees, industry: jp.industry },
      });
    }

    if (jpCacheR.status === 'fulfilled' && jpCacheR.value) {
      collected.push({ source: 'jobplanet', result: { companyType: jpCacheR.value } });
    }

    if (collected.length > 0) {
      const summary = collected
        .map(({ source, result }) => {
          const parts: string[] = [];
          if (result.companyType) parts.push(`type=${result.companyType}`);
          if (result.employees) parts.push(`emp=${result.employees}`);
          if (result.industry) parts.push(`ind=${result.industry}`);
          return `${source}(${parts.join(',') || '일부'})`;
        })
        .join(' | ');
      this.logger.log(`[Company] 조회 결과 — "${companyName}": ${summary}`);
    } else {
      this.logger.warn(`[Company] 모든 소스 실패 — "${companyName}"`);
    }

    return collected;
  }

  // ── 소스별 결과를 우선순위에 따라 병합 ────────────────────────────────

  private mergeSources(
    results: { source: string; result: Partial<EnrichResult> }[],
    knownType: string | null,
    knownEmployees: string | null = null,
  ): CompanyEntity & { sources: string } {
    const hasJobSiteData = !!(knownType || knownEmployees);
    const merged: Partial<CompanyEntity> & { source: string; sources: string } = {
      companyType: knownType,
      employees: knownEmployees,
      homeUrl: null,
      address: null,
      ceoName: null,
      foundedDate: null,
      corpCode: null,
      industry: null,
      dartUrl: null,
      source: hasJobSiteData ? 'jobSite' : 'manual',
      sources: hasJobSiteData ? JSON.stringify(['jobSite']) : JSON.stringify([]),
    };

    const usedSources: string[] = hasJobSiteData ? ['jobSite'] : [];

    // 높은 우선순위 순으로 정렬
    const sorted = [...results].sort(
      (a, b) => (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0),
    );

    for (const { source, result } of sorted) {
      usedSources.push(source);
      const priority = SOURCE_PRIORITY[source] ?? 0;
      const currentPriority = SOURCE_PRIORITY[merged.source] ?? 0;

      // companyType: 더 신뢰도 높은 소스 우선
      if (result.companyType && (!merged.companyType || priority > currentPriority)) {
        merged.companyType = result.companyType;
        merged.source = source;
      }
      // 나머지 필드: 비어 있으면 채움
      if (!merged.employees && result.employees) merged.employees = result.employees;
      if (!merged.homeUrl && result.homeUrl) merged.homeUrl = result.homeUrl;
      if (!merged.address && result.address) merged.address = result.address;
      if (!merged.ceoName && result.ceoName) merged.ceoName = result.ceoName;
      if (!merged.foundedDate && result.foundedDate) merged.foundedDate = result.foundedDate;
      if (!merged.corpCode && result.corpCode) merged.corpCode = result.corpCode;
      if (!merged.industry && result.industry) merged.industry = result.industry;
      if (!merged.dartUrl && result.dartUrl) merged.dartUrl = result.dartUrl;
    }

    merged.sources = JSON.stringify([...new Set(usedSources)]);
    return merged as CompanyEntity & { sources: string };
  }

  // ── 잡플래닛 캐시 파싱 ───────────────────────────────────────────────

  private async inferFromJobplanetCache(companyKey: string): Promise<string | null> {
    try {
      const rate = await this.rateRepo.findOne({ where: { companyKey } });
      if (!rate?.summary) return null;
      return this.parseJobplanetCompanyType(rate.summary);
    } catch {
      return null;
    }
  }

  private parseJobplanetCompanyType(summary: string): string | null {
    const patterns: { re: RegExp; type: string }[] = [
      { re: /기업\s*규모\s*[:\n\s]*(대기업)/,            type: '대기업' },
      { re: /기업\s*규모\s*[:\n\s]*(중견기업)/,           type: '중견기업' },
      { re: /기업\s*규모\s*[:\n\s]*(중소기업)/,           type: '중소기업' },
      { re: /기업\s*규모\s*[:\n\s]*(외국계)/,             type: '외국계기업' },
      { re: /기업\s*규모\s*[:\n\s]*(공공기관|공기업)/,    type: '공공기관' },
    ];
    for (const { re, type } of patterns) {
      if (re.test(summary)) return type;
    }
    const empM = summary.match(/직원\s*수?\s*[:\n\s]*(?:약\s*)?(\d[\d,]+)\s*명/);
    if (empM) {
      const count = parseInt(empM[1].replace(/,/g, ''), 10);
      if (count >= 5000) return '대기업';
      if (count >= 1000) return '중견기업';
      if (count >= 100) return '중소기업';
    }
    return null;
  }

  // ── 유틸 ──────────────────────────────────────────────────────────────

  private addSource(entity: CompanyEntity, source: string): void {
    const list = this.parseSources(entity.sources);
    if (!list.includes(source)) {
      entity.sources = JSON.stringify([...list, source]);
    }
    if (!entity.source) entity.source = source;
  }

  private parseSources(raw: string | null): string[] {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return [raw]; }
  }

  private async getDartApiKey(): Promise<string | null> {
    try {
      const rows = await this.dataSource.query(
        `SELECT dart_api_key FROM users WHERE dart_api_key IS NOT NULL AND dart_api_key != '' LIMIT 1`,
      ) as { dart_api_key: string }[];
      return rows[0]?.dart_api_key ?? null;
    } catch {
      return null;
    }
  }

  private inferCompanyType(
    corpClass: string | null,
    stockCode: string | null,
    employeesStr: string | null,
  ): string | null {
    if (!corpClass) return null;
    const employees = this.parseEmployeeCount(employeesStr);

    if (corpClass === 'Y') {
      if (employees !== null) return employees >= 1000 ? '대기업' : '중견기업';
      return stockCode ? '대기업' : '중견기업';
    }
    if (corpClass === 'K' || corpClass === 'N') {
      if (employees !== null && employees >= 1000) return '중견기업';
      return '중소기업';
    }
    if (corpClass === 'E') {
      if (employees !== null) {
        if (employees >= 5000) return '대기업';
        if (employees >= 1000) return '중견기업';
        if (employees >= 100) return '중소기업';
      }
      return null;
    }
    return null;
  }

  private parseEmployeeCount(str: string | null): number | null {
    if (!str) return null;
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? null : num;
  }

  async getMissingStats(): Promise<{ total: number; missingCompanyType: number; missingEmployees: number }> {
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

  async findByName(companyName: string): Promise<CompanyEntity | null> {
    const normalized = this.normalizeName(companyName);
    return this.repo.findOne({ where: { normalizedName: normalized } });
  }

  async patchFromAnalysis(
    companyId: string,
    fields: Partial<Pick<CompanyEntity, 'homeUrl' | 'address' | 'dartUrl' | 'ceoName' | 'foundedDate' | 'industry'>>,
  ): Promise<void> {
    const entity = await this.repo.findOne({ where: { id: companyId } });
    if (!entity) return;
    let changed = false;
    for (const [k, v] of Object.entries(fields) as [keyof typeof fields, string | null][]) {
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

  private toListItem(company: CompanyEntity, analysis: CompanyAnalysisEntity | null): CompanyListItem {
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
