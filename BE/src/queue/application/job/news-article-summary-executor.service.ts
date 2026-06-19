import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { NewsService } from 'src/news/application/service/news.service';

export interface NewsArticleSummaryRequest {
  title: string;
  url: string;
  source?: string;
  description?: string;
  model?: string;
  refresh?: boolean;
}

@Injectable()
export class NewsArticleSummaryExecutorService {
  private readonly logger = new Logger(NewsArticleSummaryExecutorService.name);

  constructor(
    private readonly newsService: NewsService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async execute(
    request: NewsArticleSummaryRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    this.logger.log(
      `[NewsArticleSummary] 요약 시작 title=${request.title.slice(0, 80)}`,
    );

    const cacheUrl = request.url?.trim();
    if (cacheUrl && !request.refresh) {
      const cached = await this.newsService
        .getArticleSummary(cacheUrl)
        .catch(() => null);
      if (cached?.summary) {
        onChunk(cached.summary);
        this.logger.log(
          `[NewsArticleSummary] 저장된 요약 사용 title=${request.title.slice(0, 80)}`,
        );
        return cached.summary;
      }
    }

    const article = request.url
      ? await this.newsService.getArticleContent(request.url).catch(() => null)
      : null;

    const content = [article?.content, request.description]
      .filter(Boolean)
      .join('\n\n')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 24000);

    const system = [
      '당신은 뉴스 기사 요약 전문가입니다.',
      '기사 원문과 메타데이터를 바탕으로 한국어로 간결하고 정확하게 요약하세요.',
      '확인되지 않은 내용은 추측하지 말고, 기사에 나온 내용만 사용하세요.',
    ].join('\n');

    const prompt = [
      `제목: ${request.title}`,
      request.source ? `출처: ${request.source}` : '',
      request.url ? `원문 URL: ${request.url}` : '',
      '',
      '기사 내용:',
      content ||
        '(본문을 가져오지 못했습니다. 제목과 설명만 기반으로 요약하세요.)',
      '',
      '아래 형식의 마크다운으로 작성하세요.',
      '- 핵심 요약: 3문장 이내',
      '- 주요 포인트: 3~5개 bullet',
      '- 왜 중요한가: 1~2문장',
    ]
      .filter(Boolean)
      .join('\n');

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(
      request.model ?? '',
      system,
      [{ role: 'user', content: prompt }],
    )) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }

    this.logger.log(`[NewsArticleSummary] 완료 length=${fullText.length}`);
    const summary = fullText.trim();
    if (cacheUrl && summary) {
      await this.newsService
        .saveArticleSummary({
          url: cacheUrl,
          title: request.title,
          source: request.source ?? null,
          description: request.description ?? null,
          summary,
          model: request.model ?? null,
          articleUrl: article?.finalUrl ?? cacheUrl,
        })
        .catch((error) => {
          this.logger.warn(
            `[NewsArticleSummary] 요약 저장 실패: ${(error as Error).message}`,
          );
        });
    }
    return summary;
  }
}
