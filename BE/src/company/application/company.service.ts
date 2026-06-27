import { Injectable } from '@nestjs/common';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyRegistryService } from 'src/company/application/internal/company-registry.service';
import { StockQuote } from 'src/financial/domain/stock/stock-market.types';

export type { StockQuote };
export type CompanyStockQuote = StockQuote;

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

export interface CompanySlimItem {
  id: string;
  name: string;
  companyType: string | null;
}

@Injectable()
export class CompanyService {
  constructor(private readonly registry: CompanyRegistryService) {}

  parseSources(raw: string | null): string[] {
    return this.registry.parseSources(raw);
  }

  addSource(entity: CompanyEntity, source: string): void {
    this.registry.addSource(entity, source);
  }

  listCompaniesSlim(
    options: {
      hasAnalysis?: boolean;
      limit?: number;
    } = {},
  ): Promise<CompanySlimItem[]> {
    return this.registry.listCompaniesSlim(options);
  }

  listCompanies(
    options: {
      q?: string;
      hasAnalysis?: boolean;
      limit?: number;
      industry?: string;
    } = {},
  ): Promise<CompanyListItem[]> {
    return this.registry.listCompanies(options);
  }

  findStockCode(idOrName: string): Promise<string | null> {
    return this.registry.findStockCode(idOrName);
  }

  findCompany(idOrName: string): Promise<CompanyListItem | null> {
    return this.registry.findCompany(idOrName);
  }

  getMissingStats(): Promise<{
    total: number;
    missingCompanyType: number;
    missingEmployees: number;
  }> {
    return this.registry.getMissingStats();
  }

  findMissingTypeCompanyIds(): Promise<string[]> {
    return this.registry.findMissingTypeCompanyIds();
  }

  findMissingTypeCompanies(): Promise<{ id: string; name: string }[]> {
    return this.registry.findMissingTypeCompanies();
  }

  findByName(companyName: string): Promise<CompanyEntity | null> {
    return this.registry.findByName(companyName);
  }

  patchFromAnalysis(
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
    return this.registry.patchFromAnalysis(companyId, fields);
  }

  upsertFinancial(
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
    return this.registry.upsertFinancial(companyId, data);
  }

  toListItem(
    company: CompanyEntity,
    analysis: CompanyAnalysisEntity | null,
    stockCode: string | null = null,
  ): CompanyListItem {
    return this.registry.toListItem(company, analysis, stockCode);
  }
}
