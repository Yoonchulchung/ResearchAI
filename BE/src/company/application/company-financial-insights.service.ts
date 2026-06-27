import { Injectable } from '@nestjs/common';
import {
  CompanyFinancialInsights,
  CompanyFinancialAiAnalysis,
} from 'src/financial/application/financial-insights.service';
import {
  QuarterlyFinancial,
  YearlyFinancial,
} from 'src/financial/infrastructure/dart/dart-financial.service';
import { CompanyFinancialInsightsImplService } from 'src/company/application/financial/company-financial-insights-impl.service';

export type {
  CompanyPeerMetric,
  CompanyRiskSignal,
  CompanyTimelineEvent,
  CompanyFinancialInsights,
  CompanyFinancialAiAnalysis,
} from 'src/financial/application/financial-insights.service';

@Injectable()
export class CompanyFinancialInsightsService {
  constructor(private readonly impl: CompanyFinancialInsightsImplService) {}

  getFinancialInsights(idOrName: string): Promise<CompanyFinancialInsights> {
    return this.impl.getFinancialInsights(idOrName);
  }

  refreshFinancials(
    companyId: string,
    dartApiKey: string,
  ): Promise<YearlyFinancial[]> {
    return this.impl.refreshFinancials(companyId, dartApiKey);
  }

  analyzeFinancialStatements(
    idOrName: string,
    model: string,
  ): Promise<CompanyFinancialAiAnalysis> {
    return this.impl.analyzeFinancialStatements(idOrName, model);
  }

  getAiAnalysisHistory(
    companyId: string,
    limit = 10,
  ): Promise<
    Array<CompanyFinancialAiAnalysis & { id: string; createdAt: string }>
  > {
    return this.impl.getAiAnalysisHistory(companyId, limit);
  }

  getQuarterlyFinancials(
    companyId: string,
    dartApiKey: string,
  ): Promise<QuarterlyFinancial[]> {
    return this.impl.getQuarterlyFinancials(companyId, dartApiKey);
  }
}
