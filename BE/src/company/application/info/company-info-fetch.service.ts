import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CompanyRateEntity } from 'src/company/domain/entity/company-rate.entity';
import { DartFinancialService } from 'src/financial/infrastructure/dart/dart-financial.service';
import { JasoseolCompanyService } from 'src/company/infrastructure/jobportal/jasoseol-company.service';
import { JobkoreaCompanyService } from 'src/company/infrastructure/jobportal/jobkorea-company.service';
import { JobplanetInfoService } from 'src/company/infrastructure/jobportal/jobplanet-info.service';
import { NamuWikiService } from 'src/company/infrastructure/namu-wiki.service';
import { SaraminCompanyService } from 'src/company/infrastructure/jobportal/saramin-company.service';
import {
  CompanyInfoResult,
  CompanyInfoApiStats,
  CompanyRefreshMissingProgressHandler,
  InfoSourceKey,
  SOURCE_PRIORITY,
} from './company-info.types';

const SOURCE_LABELS: Record<InfoSourceKey, string> = {
  dart: 'DART',
  jobkorea: 'JobKorea',
  jasoseol: 'Jasoseol',
  jobplanet: 'JobPlanet',
  'namu-wiki': 'NamuWiki',
  saramin: 'Saramin',
};

@Injectable()
export class CompanyInfoFetchService {
  private readonly logger = new Logger(CompanyInfoFetchService.name);
  private apiStats: CompanyInfoApiStats = {};

  constructor(
    @InjectRepository(CompanyRateEntity)
    private readonly rateRepo: Repository<CompanyRateEntity>,
    private readonly dartFinancial: DartFinancialService,
    private readonly jasoseol: JasoseolCompanyService,
    private readonly jobkorea: JobkoreaCompanyService,
    private readonly jobplanetInfo: JobplanetInfoService,
    private readonly namuWiki: NamuWikiService,
    private readonly saramin: SaraminCompanyService,
    private readonly dataSource: DataSource,
  ) {}

  resetStats(): void {
    this.apiStats = {};
  }

  getStats(): CompanyInfoApiStats {
    return { ...this.apiStats };
  }

  private recordCall(source: string, success: boolean): void {
    if (!this.apiStats[source])
      this.apiStats[source] = { calls: 0, success: 0, fail: 0 };
    this.apiStats[source].calls++;
    if (success) this.apiStats[source].success++;
    else this.apiStats[source].fail++;
  }

  inferTypeFromName(name: string): string | null {
    if (/병원|의원|클리닉|한의원|요양원|치과/.test(name)) return '병원';
    if (
      /학교|대학교|대학원|초등학교|중학교|고등학교|유치원|어린이집/.test(name)
    )
      return '학교';
    if (/공단|공사|공기업|지방공기업/.test(name)) return '공공기관';
    if (/재단법인|사단법인|재단|협회|연구원|연구소/.test(name))
      return '공공기관';
    if (/정부|공공|국립|국가|중앙|지방|청$|부$|처$|위원회$/.test(name))
      return '공공기관';
    if (/(진흥원|평가원|기술원|표준원|관리원|검사원|교육원)$/.test(name))
      return '공공기관';
    return null;
  }

  shouldUseNamuWiki(companyName: string): boolean {
    return this.inferTypeFromName(companyName) === '공공기관';
  }

  cleanSearchName(name: string): string {
    const cleaned = name
      .replace(
        /\(주\)|㈜|\(유\)|㈔|주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/gi,
        '',
      )
      .replace(/[\s()（）\[\]]/g, '')
      .trim();
    return cleaned || name;
  }

  inferCompanyType(
    corpClass: string | null,
    employeesStr: string | null,
  ): string | null {
    if (!corpClass) return null;
    const employees = this.parseEmployeeCount(employeesStr);
    if (employees === null) return null;

    if (corpClass === 'Y') return employees >= 1000 ? '대기업' : '중견기업';
    if (corpClass === 'K' || corpClass === 'N') {
      return employees >= 1000 ? '중견기업' : '중소기업';
    }
    if (corpClass === 'E') {
      if (employees >= 5000) return '대기업';
      if (employees >= 1000) return '중견기업';
      if (employees >= 100) return '중소기업';
    }
    return null;
  }

  private parseEmployeeCount(str: string | null): number | null {
    if (!str) return null;
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? null : num;
  }

  private parseJobplanetCompanyType(summary: string): string | null {
    const patterns: { re: RegExp; type: string }[] = [
      { re: /기업\s*규모\s*[:\n\s]*(대기업)/, type: '대기업' },
      { re: /기업\s*규모\s*[:\n\s]*(중견기업)/, type: '중견기업' },
      { re: /기업\s*규모\s*[:\n\s]*(중소기업)/, type: '중소기업' },
      { re: /기업\s*규모\s*[:\n\s]*(외국계)/, type: '외국계기업' },
      { re: /기업\s*규모\s*[:\n\s]*(공공기관|공기업)/, type: '공공기관' },
    ];
    for (const { re, type } of patterns) {
      if (re.test(summary)) return type;
    }
    const empM = summary.match(
      /직원\s*수?\s*[:\n\s]*(?:약\s*)?(\d[\d,]+)\s*명/,
    );
    if (empM) {
      const count = parseInt(empM[1].replace(/,/g, ''), 10);
      if (count >= 5000) return '대기업';
      if (count >= 1000) return '중견기업';
      if (count >= 100) return '중소기업';
    }
    return null;
  }

  async inferFromJobplanetCache(companyKey: string): Promise<string | null> {
    try {
      const rate = await this.rateRepo.findOne({ where: { companyKey } });
      if (!rate?.summary) return null;
      return this.parseJobplanetCompanyType(rate.summary);
    } catch {
      return null;
    }
  }

  private async getDartApiKey(): Promise<string | null> {
    try {
      const rows = await this.dataSource.query(
        `SELECT dart_api_key FROM users WHERE dart_api_key IS NOT NULL AND dart_api_key != '' LIMIT 1`,
      );
      return rows[0]?.dart_api_key ?? null;
    } catch {
      return null;
    }
  }

  async fetchAllSources(
    companyName: string,
    companyKey: string,
    {
      force = false,
      signal,
      onProgress,
    }: {
      force?: boolean;
      signal?: AbortSignal;
      onProgress?: CompanyRefreshMissingProgressHandler;
    } = {},
  ): Promise<{ source: string; result: Partial<CompanyInfoResult> }[]> {
    const searchName = this.cleanSearchName(companyName);
    const useNamu = this.shouldUseNamuWiki(companyName);
    const collected: { source: string; result: Partial<CompanyInfoResult> }[] =
      [];
    const sourceTotal = useNamu ? 8 : 7;
    let completedSources = 0;

    const nameType = this.inferTypeFromName(companyName);
    if (nameType) {
      collected.push({
        source: 'name-inference',
        result: { companyType: nameType },
      });
    }

    const abort = <T>(p: Promise<T>): Promise<T> => {
      if (!signal) return p;
      if (signal.aborted)
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        p.then(resolve, reject).finally(() =>
          signal.removeEventListener('abort', onAbort),
        );
      });
    };

    const emitSource = (
      source: InfoSourceKey,
      status: 'running' | 'success' | 'empty' | 'error' | 'skipped',
      message: string,
    ) => {
      onProgress?.({
        type: 'source',
        source,
        label: SOURCE_LABELS[source],
        status,
        completed: completedSources,
        total: sourceTotal,
        message,
      });
    };

    const trackSource = async <T>(
      source: InfoSourceKey,
      promise: Promise<T>,
    ): Promise<T> => {
      emitSource(source, 'running', `${SOURCE_LABELS[source]} 조회 중입니다.`);
      try {
        const value = await abort(promise);
        completedSources++;
        emitSource(
          source,
          value ? 'success' : 'empty',
          value
            ? `${SOURCE_LABELS[source]}에서 데이터를 찾았습니다.`
            : `${SOURCE_LABELS[source]}에서 유효한 데이터를 찾지 못했습니다.`,
        );
        return value;
      } catch (error) {
        completedSources++;
        emitSource(
          source,
          'error',
          `${SOURCE_LABELS[source]} 조회 실패: ${(error as Error).message}`,
        );
        throw error;
      }
    };

    const skipSource = async (
      source: InfoSourceKey,
      message: string,
    ): Promise<null> => {
      completedSources++;
      emitSource(source, 'skipped', message);
      return null;
    };

    const dartApiKeyPromise = this.getDartApiKey();
    const dartPromise = (async () => {
      const key = await dartApiKeyPromise;
      if (!key) return skipSource('dart', 'DART API 키가 없어 건너뜁니다.');
      return trackSource(
        'dart',
        this.dartFinancial.fetchCompanyData(searchName, key),
      );
    })();

    const [dartApiKeyR, dartR, jkR, jasR, jpInfoR, jpCacheR, saraminR, namuR] =
      await Promise.allSettled([
        dartApiKeyPromise,
        dartPromise,
        trackSource(
          'jobkorea',
          this.jobkorea.fetchCompanyInfo(searchName, { force }),
        ),
        trackSource(
          'jasoseol',
          this.jasoseol.fetchCompanyInfo(searchName, { force }),
        ),
        trackSource(
          'jobplanet',
          this.jobplanetInfo.fetchCompanyInfo(searchName, { force }),
        ),
        abort(this.inferFromJobplanetCache(companyKey)),
        trackSource(
          'saramin',
          this.saramin.fetchCompanyInfo(searchName, { force }),
        ),
        useNamu
          ? trackSource(
              'namu-wiki',
              this.namuWiki.fetchCompanyInfo(searchName, { force }),
            )
          : skipSource('namu-wiki', '나무위키는 공공기관만 조회합니다.'),
      ]);

    const dartApiKey =
      dartApiKeyR.status === 'fulfilled' ? dartApiKeyR.value : null;

    if (dartApiKey)
      this.recordCall(
        'DART',
        dartR.status === 'fulfilled' && dartR.value !== null,
      );
    this.recordCall(
      '잡코리아',
      jkR.status === 'fulfilled' && jkR.value !== null,
    );
    this.recordCall(
      '자소설',
      jasR.status === 'fulfilled' && jasR.value !== null,
    );
    this.recordCall(
      '잡플래닛',
      jpInfoR.status === 'fulfilled' && jpInfoR.value !== null,
    );
    this.recordCall(
      '사람인',
      saraminR.status === 'fulfilled' && saraminR.value !== null,
    );
    if (useNamu)
      this.recordCall(
        '나무위키',
        namuR.status === 'fulfilled' && namuR.value !== null,
      );

    if (dartR.status === 'fulfilled' && dartR.value) {
      const d = dartR.value;
      if (typeof d === 'object' && d !== null && 'corpCode' in d) {
        const dart = d as any;
        collected.push({
          source: 'dart',
          result: {
            companyType: this.inferCompanyType(dart.corpClass, dart.employees),
            employees: dart.employees,
            homeUrl: dart.homeUrl,
            address: dart.address,
            ceoName: dart.ceoName,
            foundedDate: dart.foundedDate,
            corpCode: dart.corpCode,
            dartUrl: dart.dartUrl,
          },
        });
      }
    } else if (dartR.status === 'rejected') {
      this.logger.warn(
        `[Company] DART 실패 — "${companyName}": ${dartR.reason}`,
      );
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
          discoveredEnglishName: jk.englishName,
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
        result: {
          companyType: jp.companyType,
          employees: jp.employees,
          industry: jp.industry,
        },
      });
    }

    if (jpCacheR.status === 'fulfilled' && jpCacheR.value) {
      collected.push({
        source: 'jobplanet',
        result: { companyType: jpCacheR.value },
      });
    }

    if (saraminR.status === 'fulfilled' && saraminR.value) {
      const sar = saraminR.value;
      collected.push({
        source: 'saramin',
        result: {
          companyType: sar.companyType,
          employees: sar.employees,
          foundedDate: sar.foundedDate,
          address: sar.address,
          homeUrl: sar.homeUrl,
          industry: sar.industry,
          ceoName: sar.ceoName,
          discoveredEnglishName: sar.englishName,
        },
      });
    } else if (saraminR.status === 'rejected') {
      this.logger.warn(
        `[Company] Saramin 실패 — "${companyName}": ${saraminR.reason}`,
      );
    }

    if (namuR.status === 'fulfilled' && namuR.value && useNamu) {
      const namu = namuR.value as any;
      if (namu && 'companyType' in namu) {
        collected.push({
          source: 'namu-wiki',
          result: {
            companyType: namu.companyType,
            employees: namu.employees,
            foundedDate: namu.foundedDate,
          },
        });
      }
    } else if (namuR.status === 'rejected' && useNamu) {
      this.logger.warn(
        `[Company] NamuWiki 실패 — "${companyName}": ${namuR.reason}`,
      );
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
    } else {
      this.logger.warn(`[Company] 모든 소스 실패 — "${companyName}"`);
    }

    return collected;
  }
}
