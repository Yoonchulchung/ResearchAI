import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { WebSearchService } from 'src/research/application/web-search.service';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';

export interface StockResearchChunk {
  type: 'text' | 'companies' | 'done' | 'error';
  text?: string;
  companies?: Array<{
    name: string;
    stockCode?: string | null;
    industry?: string | null;
    relation?: string;
  }>;
  error?: string;
}

const SYSTEM_PROMPT = `당신은 주식·기업 리서치 전문가입니다.
사용자의 질문에 대해 아래 항목을 포함해 분석합니다:
- 관련 기업명, 종목코드, 업종
- 기업 간 공급망·납품 관계 및 비중 (알 수 있는 경우)
- FTA·협약·계약 등 주요 비즈니스 관계
- 테마/섹터 내 위치와 투자 포인트

응답은 한국어로 작성하고, 마크다운을 활용해 구조적으로 정리해주세요.
기업명은 **볼드**, 종목코드는 \`코드\` 형식으로 표시하세요.
불확실한 정보는 명확히 구분하세요.`;

@Injectable()
export class StockResearchImplService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly webSearch: WebSearchService,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(CompanyFinancialEntity)
    private readonly financialRepo: Repository<CompanyFinancialEntity>,
  ) {}

  async *research(query: string): AsyncGenerator<StockResearchChunk> {
    // 1. 키워드로 DB에서 관련 기업 탐색
    const dbCompanies = await this.findRelatedCompanies(query);
    if (dbCompanies.length > 0) {
      yield { type: 'companies', companies: dbCompanies };
    }

    // 2. 웹 검색으로 최신 정보 수집
    let searchContext = '';
    if (this.webSearch.hasExternalSearch()) {
      try {
        const { context } = await this.webSearch.runSearch(
          `${query} 기업 공급망 납품 협약 관계`,
        );
        searchContext = context;
      } catch {
        /* 검색 실패 시 AI만 활용 */
      }
    }

    // 3. AI 스트리밍 응답
    const dbContext =
      dbCompanies.length > 0
        ? `\n\n[DB에서 찾은 관련 기업]\n${dbCompanies.map((c) => `- ${c.name}${c.stockCode ? ` (${c.stockCode})` : ''}${c.industry ? ` / ${c.industry}` : ''}`).join('\n')}`
        : '';
    const webContext = searchContext
      ? `\n\n[웹 검색 결과 요약]\n${searchContext.slice(0, 3000)}`
      : '';

    const userMessage = `질문: ${query}${dbContext}${webContext}`;

    try {
      const stream = this.aiProvider.stream(
        'claude-sonnet-4-6',
        SYSTEM_PROMPT,
        [{ role: 'user', content: userMessage }],
      );

      for await (const chunk of stream) {
        yield { type: 'text', text: chunk };
      }
      yield { type: 'done' };
    } catch (e) {
      yield { type: 'error', error: (e as Error).message };
    }
  }

  private async findRelatedCompanies(query: string) {
    const keywords = query
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter((k) => k.length >= 2)
      .slice(0, 4);

    if (keywords.length === 0) return [];

    const results: Array<{
      name: string;
      stockCode: string | null;
      industry: string | null;
      relation?: string;
    }> = [];

    for (const keyword of keywords) {
      const companies = await this.companyRepo.find({
        where: [
          { name: Like(`%${keyword}%`) },
          { industry: Like(`%${keyword}%`) },
        ],
        take: 5,
      });

      for (const c of companies) {
        if (results.find((r) => r.name === c.name)) continue;
        const financial = await this.financialRepo.findOne({
          where: { companyId: c.id },
        });
        results.push({
          name: c.name,
          stockCode: financial?.stockCode ?? null,
          industry: c.industry,
          relation: `"${keyword}" 키워드 매칭`,
        });
      }
    }

    return results.slice(0, 10);
  }
}
