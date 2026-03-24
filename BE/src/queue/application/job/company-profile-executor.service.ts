import { Injectable, Logger } from '@nestjs/common';
import { WebSearchService } from '../../../research/application/web-search.service';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';

@Injectable()
export class CompanyProfileExecutorService {
  private readonly logger = new Logger(CompanyProfileExecutorService.name);

  constructor(
    private readonly webSearch: WebSearchService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async execute(
    companyName: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    // 1. 웹 검색으로 인재상 정보 수집
    this.logger.log(`[CompanyProfile] Searching for: ${companyName} 인재상`);

    let searchContext = '';
    if (this.webSearch.hasExternalSearch()) {
      try {
        const query = `${companyName} 인재상 핵심가치 인재 채용 공식`;
        const { context } = await this.webSearch.runSearch(query);
        searchContext = context;
        this.logger.log(`[CompanyProfile] Search done, context length: ${context.length}`);
      } catch (e) {
        this.logger.warn(`[CompanyProfile] Search failed: ${e}`);
      }
    } else {
      this.logger.warn('[CompanyProfile] No external search available, using AI knowledge only');
    }

    // 2. AI로 검색 결과 합성
    const systemPrompt = `당신은 기업 정보 전문 분석가입니다.
웹 검색 결과를 바탕으로 기업의 인재상을 정확하게 정리해줍니다.
검색 결과에 없는 내용은 추측하지 말고, 불확실한 경우 "공식 확인 필요"라고 명시하세요.
마크다운 형식으로 간결하게 작성합니다.`;

    const userPrompt = searchContext
      ? `다음은 "${companyName}" 인재상에 대한 웹 검색 결과입니다:

---
${searchContext}
---

위 검색 결과를 바탕으로 ${companyName}의 인재상을 다음 형식으로 정리해주세요:

## 핵심 인재상
(키워드 3~5개와 각 설명)

## 자소서에서 중요하게 보는 요소
(구체적인 포인트 3~5개)

## 출처 기반 특이사항
(검색 결과에서 발견한 공식 채용 기준이나 특징)`
      : `${companyName}의 인재상을 다음 형식으로 정리해주세요. (웹 검색 결과 없음 — 학습 데이터 기반)

## 핵심 인재상
(키워드 3~5개와 각 설명)

## 자소서에서 중요하게 보는 요소
(구체적인 포인트 3~5개)

⚠️ 웹 검색을 사용할 수 없어 AI 학습 데이터 기반으로 작성되었습니다. 실제 채용 공고를 반드시 확인하세요.`;

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(model, systemPrompt, [{ role: 'user', content: userPrompt }])) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }
    return fullText;
  }
}
