import { Injectable } from '@nestjs/common';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyListItem } from 'src/company/application/company.service';
import { CompanyInfoImplService } from 'src/company/application/info/company-info-impl.service';
import type {
  CompanyInfoApiStats,
  CompanyRefreshMissingProgressHandler,
} from 'src/company/application/info/company-info.types';

export type {
  CompanyInfoApiStats,
  CompanyRefreshMissingProgress,
} from 'src/company/application/info/company-info.types';

/** @deprecated use CompanyInfoApiStats */
export type EnrichApiStats = CompanyInfoApiStats;

@Injectable()
export class CompanyInfoService {
  constructor(private readonly impl: CompanyInfoImplService) {}

  resetStats(): void {
    this.impl.resetStats();
  }

  getStats(): CompanyInfoApiStats {
    return this.impl.getStats();
  }

  findOrCreate(
    companyName: string,
    knownType?: string | null,
    knownEmployees?: string | null,
    signal?: AbortSignal,
  ): Promise<CompanyEntity | null> {
    return this.impl.findOrCreate(
      companyName,
      knownType,
      knownEmployees,
      signal,
    );
  }

  refreshMissing(
    idOrName: string,
    options: {
      force?: boolean;
      signal?: AbortSignal;
      onProgress?: CompanyRefreshMissingProgressHandler;
    } = {},
  ): Promise<CompanyListItem> {
    return this.impl.refreshMissing(idOrName, options);
  }
}
