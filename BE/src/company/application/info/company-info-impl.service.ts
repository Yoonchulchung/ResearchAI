import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import {
  CompanyService,
  CompanyListItem,
} from 'src/company/application/company.service';
import { CompanyInfoFetchService } from './company-info-fetch.service';
import { isAsciiCompanyName } from 'src/company/application/info/company-name-search.util';
import { CompanyEnglishNameService } from 'src/company/application/info/company-english-name.service';
import {
  CompanyInfoApiStats,
  CompanyInfoResult,
  CompanyRefreshMissingProgress,
  CompanyRefreshMissingProgressHandler,
  SOURCE_PRIORITY,
} from './company-info.types';

export type { CompanyInfoApiStats, CompanyRefreshMissingProgress };

/** @deprecated use CompanyInfoApiStats */
export type EnrichApiStats = CompanyInfoApiStats;

@Injectable()
export class CompanyInfoImplService {
  private readonly logger = new Logger(CompanyInfoImplService.name);

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly repo: Repository<CompanyEntity>,
    private readonly fetch: CompanyInfoFetchService,
    private readonly companyService: CompanyService,
    private readonly englishName: CompanyEnglishNameService,
  ) {}

  resetStats(): void {
    this.fetch.resetStats();
  }

  getStats(): CompanyInfoApiStats {
    return this.fetch.getStats();
  }

  private normalizeName(name: string): string {
    return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
  }

  private parseSources(raw: string | null): string[] {
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [raw];
    }
  }

  private addSource(entity: CompanyEntity, source: string): void {
    const list = this.parseSources(entity.sources);
    if (!list.includes(source))
      entity.sources = JSON.stringify([...list, source]);
    if (!entity.source) entity.source = source;
  }

  async findOrCreate(
    companyName: string,
    knownType?: string | null,
    knownEmployees?: string | null,
    signal?: AbortSignal,
  ): Promise<CompanyEntity | null> {
    if (!companyName?.trim()) return null;

    const inputName = companyName.trim();
    const isEnglish = isAsciiCompanyName(inputName);

    const normalized = this.normalizeName(inputName);

    // 한국어 normalizedName 으로 먼저 검색, 영문명 입력이면 englishName 컬럼도 검색
    const existing = await this.repo.findOne({
      where: isEnglish
        ? [{ normalizedName: normalized }, { englishName: inputName }]
        : [{ normalizedName: normalized }],
    });

    if (existing) {
      let changed = false;
      if (isEnglish && !existing.englishName) {
        existing.englishName = inputName;
        changed = true;
      }
      if (existing.source !== 'dart') {
        if (changed) await this.repo.save(existing);
        return this.enrich(
          existing,
          knownType ?? null,
          knownEmployees ?? null,
          signal,
        );
      }
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

    return this.createNew(
      inputName,
      normalized,
      knownType ?? null,
      knownEmployees ?? null,
      signal,
      isEnglish ? inputName : null,
    );
  }

  async refreshMissing(
    idOrName: string,
    {
      force = false,
      signal,
      onProgress,
    }: {
      force?: boolean;
      signal?: AbortSignal;
      onProgress?: CompanyRefreshMissingProgressHandler;
    } = {},
  ): Promise<CompanyListItem> {
    const normalized = this.normalizeName(idOrName);
    const company = await this.repo.findOne({
      where: [
        { id: idOrName },
        { normalizedName: normalized },
        { name: idOrName },
      ],
    });
    if (!company) throw new NotFoundException('기업을 찾을 수 없습니다.');

    const progressTotal = this.fetch.shouldUseNamuWiki(company.name) ? 8 : 7;

    onProgress?.({
      type: 'start',
      companyId: company.id,
      companyName: company.name,
      completed: 0,
      total: progressTotal,
      message: `"${company.name}" 결측치 수집을 시작합니다.`,
    });

    const results = await this.fetch.fetchAllSources(
      company.name,
      company.normalizedName,
      { force, signal, onProgress },
    );

    onProgress?.({
      type: 'merge',
      completed: progressTotal - 1,
      total: progressTotal,
      message: '수집 결과를 우선순위에 따라 병합 중입니다.',
    });

    const merged = this.mergeSources(results, null, null);

    let changed = false;
    const setIfChanged = <K extends keyof CompanyEntity>(
      key: K,
      value: CompanyEntity[K],
    ) => {
      if (value && company[key] !== value) {
        company[key] = value;
        changed = true;
      }
    };

    setIfChanged('companyType', merged.companyType);
    setIfChanged('employees', merged.employees);
    setIfChanged('homeUrl', merged.homeUrl);
    setIfChanged('address', merged.address);
    setIfChanged('ceoName', merged.ceoName);
    setIfChanged('corpCode', merged.corpCode);
    setIfChanged('foundedDate', merged.foundedDate);
    setIfChanged('industry', merged.industry);
    setIfChanged('dartUrl', merged.dartUrl);

    // 소스에서 발견된 영문명 저장 (스크래퍼 → 홈페이지 순으로 시도)
    if (!company.englishName) {
      const fromScraper =
        results.map((r) => r.result.discoveredEnglishName).find((n) => n) ??
        null;
      const homeUrlToCheck = company.homeUrl ?? merged.homeUrl;
      const fromSite =
        !fromScraper && homeUrlToCheck
          ? await this.englishName.extractFromUrl(homeUrlToCheck)
          : null;
      const resolved = fromScraper ?? fromSite ?? null;
      if (resolved) {
        company.englishName = resolved;
        changed = true;
      }
    }

    if (
      merged.source &&
      merged.source !== 'manual' &&
      company.source !== merged.source
    ) {
      company.source = merged.source;
      changed = true;
    } else if (company.source === 'namu-wiki') {
      company.source = null;
      changed = true;
    }

    const existingSources = this.parseSources(company.sources).filter(
      (s) => s !== 'namu-wiki',
    );
    const collectedSources = this.parseSources(merged.sources);
    const nextSources = [...new Set([...existingSources, ...collectedSources])];
    if (
      JSON.stringify(nextSources) !==
      JSON.stringify(this.parseSources(company.sources))
    ) {
      company.sources = JSON.stringify(nextSources);
      changed = true;
    }

    if (force && !company.companyType) {
      company.refreshSkippedAt = new Date();
      changed = true;
    }

    if (changed) await this.repo.save(company);

    const result = await this.companyService.findCompany(company.id);
    onProgress?.({
      type: 'saving',
      completed: progressTotal,
      total: progressTotal,
      message: changed
        ? '변경된 기업 정보를 DB에 저장했습니다.'
        : '새로 반영할 변경 사항이 없습니다.',
    });
    onProgress?.({
      type: 'done',
      completed: progressTotal,
      total: progressTotal,
      message: '결측치 수집이 완료되었습니다.',
      result: result!,
    });
    return result!;
  }

  private async createNew(
    companyName: string,
    normalizedName: string,
    knownType: string | null,
    knownEmployees: string | null = null,
    signal?: AbortSignal,
    inputEnglishName: string | null = null,
  ): Promise<CompanyEntity | null> {
    const results = await this.fetch.fetchAllSources(
      companyName,
      normalizedName,
      { signal },
    );
    const merged = this.mergeSources(results, knownType, knownEmployees);

    // 소스가 반환한 한국어 공식명이 있으면 이름을 교체하고 영문명을 보존
    const discoveredKoreanName =
      results
        .map((r) => r.result.discoveredName)
        .find((n) => n && n !== companyName) ?? null;
    const discoveredEnglishName =
      results
        .map((r) => r.result.discoveredEnglishName)
        .find((n) => n && n !== companyName) ?? null;

    const canonicalName = discoveredKoreanName ?? companyName;
    const canonicalNormalized = discoveredKoreanName
      ? this.normalizeName(discoveredKoreanName)
      : normalizedName;
    const englishName = inputEnglishName ?? discoveredEnglishName ?? null;

    const entity = this.repo.create({
      ...merged,
      id: randomUUID(),
      normalizedName: canonicalNormalized,
      name: canonicalName,
      englishName,
    });

    try {
      await this.repo.save(entity);
      return entity;
    } catch {
      return (
        (await this.repo.findOne({
          where: { normalizedName: canonicalNormalized },
        })) ?? null
      );
    }
  }

  private async enrich(
    entity: CompanyEntity,
    knownType: string | null,
    knownEmployees: string | null = null,
    signal?: AbortSignal,
  ): Promise<CompanyEntity> {
    const results = await this.fetch.fetchAllSources(
      entity.name,
      this.normalizeName(entity.name),
      { signal },
    );
    const merged = this.mergeSources(results, knownType, knownEmployees);

    const existingPriority = SOURCE_PRIORITY[entity.source ?? 'manual'] ?? 0;
    const newPriority = SOURCE_PRIORITY[merged.source ?? 'manual'] ?? 0;

    if (
      merged.companyType &&
      (!entity.companyType || newPriority >= existingPriority)
    ) {
      entity.companyType = merged.companyType;
      entity.source = merged.source;
    }
    if (!entity.employees && merged.employees)
      entity.employees = merged.employees;
    if (!entity.homeUrl && merged.homeUrl) entity.homeUrl = merged.homeUrl;
    if (!entity.address && merged.address) entity.address = merged.address;
    if (!entity.ceoName && merged.ceoName) entity.ceoName = merged.ceoName;
    if (!entity.corpCode && merged.corpCode) entity.corpCode = merged.corpCode;
    if (!entity.foundedDate && merged.foundedDate)
      entity.foundedDate = merged.foundedDate;
    if (!entity.industry && merged.industry) entity.industry = merged.industry;
    if (!entity.dartUrl && merged.dartUrl) entity.dartUrl = merged.dartUrl;

    if (!entity.englishName) {
      const fromScraper =
        results.map((r) => r.result.discoveredEnglishName).find((n) => n) ??
        null;
      const homeUrlToCheck = entity.homeUrl ?? merged.homeUrl;
      const fromSite =
        !fromScraper && homeUrlToCheck
          ? await this.englishName.extractFromUrl(homeUrlToCheck)
          : null;
      entity.englishName = fromScraper ?? fromSite ?? null;
    }

    const existing = this.parseSources(entity.sources);
    const added = this.parseSources(merged.sources);
    entity.sources = JSON.stringify([...new Set([...existing, ...added])]);

    await this.repo.save(entity);
    return entity;
  }

  private mergeSources(
    results: { source: string; result: Partial<CompanyInfoResult> }[],
    knownType: string | null,
    knownEmployees: string | null = null,
  ): CompanyEntity & { sources: string } {
    const hasJobSiteData = !!(knownType || knownEmployees);
    const merged: Partial<CompanyEntity> & { source: string; sources: string } =
      {
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
        sources: hasJobSiteData
          ? JSON.stringify(['jobSite'])
          : JSON.stringify([]),
      };

    const usedSources: string[] = hasJobSiteData ? ['jobSite'] : [];
    const sorted = [...results].sort(
      (a, b) =>
        (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0),
    );

    for (const { source, result } of sorted) {
      usedSources.push(source);
      const priority = SOURCE_PRIORITY[source] ?? 0;
      const currentPriority = SOURCE_PRIORITY[merged.source] ?? 0;

      if (
        result.companyType &&
        (!merged.companyType || priority > currentPriority)
      ) {
        merged.companyType = result.companyType;
        merged.source = source;
      }
      if (!merged.employees && result.employees)
        merged.employees = result.employees;
      if (!merged.homeUrl && result.homeUrl) merged.homeUrl = result.homeUrl;
      if (!merged.address && result.address) merged.address = result.address;
      if (!merged.ceoName && result.ceoName) merged.ceoName = result.ceoName;
      if (!merged.foundedDate && result.foundedDate)
        merged.foundedDate = result.foundedDate;
      if (!merged.corpCode && result.corpCode)
        merged.corpCode = result.corpCode;
      if (!merged.industry && result.industry)
        merged.industry = result.industry;
      if (!merged.dartUrl && result.dartUrl) merged.dartUrl = result.dartUrl;
    }

    merged.sources = JSON.stringify([...new Set(usedSources)]);
    return merged as CompanyEntity & { sources: string };
  }
}
