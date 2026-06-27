import { Injectable } from '@nestjs/common';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { CompanyNewsEntity } from 'src/company/domain/entity/company-news.entity';
import { YearlyFinancial } from 'src/financial/infrastructure/dart/dart-financial.service';
import {
  CompanyFinancialAiAnalysis,
  CompanyRiskSignal,
  CompanyTimelineEvent,
  FinancialInsightsImplService,
} from 'src/financial/application/insights/financial-insights-impl.service';

export type {
  CompanyPeerMetric,
  CompanyRiskSignal,
  CompanyTimelineEvent,
  CompanyFinancialInsights,
  CompanyFinancialAiAnalysis,
} from 'src/financial/application/insights/financial-insights-impl.service';

export { PEER_METRIC_DEFS } from 'src/financial/application/insights/financial-insights-impl.service';

@Injectable()
export class FinancialInsightsService {
  constructor(private readonly impl: FinancialInsightsImplService) {}

  parseFinancialRows(raw: string | null | undefined): YearlyFinancial[] {
    return this.impl.parseFinancialRows(raw);
  }

  parseDisclosures(
    raw: string | null | undefined,
  ): { title: string; date: string; url: string }[] {
    return this.impl.parseDisclosures(raw);
  }

  parseCompetitorNames(raw: string | null | undefined): string[] {
    return this.impl.parseCompetitorNames(raw);
  }

  buildFinancialRiskSignals(
    latest: YearlyFinancial | null,
    previous: YearlyFinancial | null,
  ): CompanyRiskSignal[] {
    return this.impl.buildFinancialRiskSignals(latest, previous);
  }

  buildTimelineEvents(
    financial: CompanyFinancialEntity | null,
    yearly: YearlyFinancial[],
    riskSignals: CompanyRiskSignal[],
    newsRows: CompanyNewsEntity[],
  ): CompanyTimelineEvent[] {
    return this.impl.buildTimelineEvents(
      financial,
      yearly,
      riskSignals,
      newsRows,
    );
  }

  parseFinancialAiResponse(
    text: string,
    yearly: YearlyFinancial[],
  ): Omit<
    CompanyFinancialAiAnalysis,
    'model' | 'inputTokens' | 'outputTokens' | 'estimatedFees' | 'analyzedAt'
  > {
    return this.impl.parseFinancialAiResponse(text, yearly);
  }

  financialMetricValue(
    row: YearlyFinancial | null,
    key: keyof YearlyFinancial,
  ): number | null {
    return this.impl.financialMetricValue(row, key);
  }

  industrySimilarity(a?: string | null, b?: string | null): number {
    return this.impl.industrySimilarity(a, b);
  }

  asNumber(value: unknown): number | null {
    return this.impl.asNumber(value);
  }

  asText(value: unknown): string {
    return this.impl.asText(value);
  }

  avg(values: number[]): number {
    return this.impl.avg(values);
  }

  round2(value: number): number {
    return this.impl.round2(value);
  }

  changePct(
    current: number | null | undefined,
    previous: number | null | undefined,
  ): number | null {
    return this.impl.changePct(current, previous);
  }

  normalizeDateString(value: string | null | undefined): string | null {
    return this.impl.normalizeDateString(value);
  }
}
