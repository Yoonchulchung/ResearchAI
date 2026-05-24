import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import {
  buildPortfolioEvaluationPrompt,
  PORTFOLIO_EVALUATION_SYSTEM_PROMPT,
} from '../../../recruit/domain/documents/doc-parse.prompts';

@Injectable()
export class DocParseExecutorService {
  constructor(private readonly aiProvider: AiProviderService) {}

  async executeAsk(
    docText: string,
    question: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const system = `당신은 문서 분석 전문가입니다. 사용자가 제공한 문서 내용을 기반으로 질문에 답변합니다.
답변은 한국어로 작성하고, 문서에 없는 내용은 추측하지 마세요.
문서 내용에서 관련 부분을 인용하거나 참조하여 답변하세요.`;
    const prompt = `=== 문서 내용 ===\n${docText.slice(0, 30000)}\n\n=== 질문 ===\n${question}`;

    let full = '';
    for await (const chunk of this.aiProvider.stream(model, system, [{ role: 'user', content: prompt }])) {
      if (signal?.aborted) break;
      full += chunk;
      onChunk(chunk);
    }
    return full;
  }

  async executeAction(
    action: string,
    docText: string | undefined,
    pages: string[] | undefined,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const { system, prompt } = this.buildPrompt(action, docText, pages);
    let full = '';
    for await (const chunk of this.aiProvider.stream(model, system, [{ role: 'user', content: prompt }])) {
      if (signal?.aborted) break;
      full += chunk;
      onChunk(chunk);
    }
    return full;
  }

  private buildPrompt(
    action: string,
    docText?: string,
    pages?: string[],
  ): { system: string; prompt: string } {
    const text = (docText ?? pages?.join('\n\n') ?? '').slice(0, 30000);

    if (action === 'translate') {
      return {
        system: '당신은 번역 전문가입니다. 원문의 구조와 형식을 최대한 유지하세요.',
        prompt: `이 문서의 내용을 한국어로 번역해주세요:\n\n${text}`,
      };
    }
    if (action === 'explain') {
      return {
        system: '당신은 문서 설명 전문가입니다.',
        prompt: `이 문서의 내용을 쉬운 말로 설명해주세요. 전문 용어가 있다면 풀어서 설명하세요:\n\n${text}`,
      };
    }
    if (action === 'keywords') {
      return {
        system: '당신은 문서 분석 전문가입니다.',
        prompt: `이 문서에서 핵심 키워드와 주요 개념을 추출하고 각각 간략히 설명해주세요:\n\n${text}`,
      };
    }
    if (action === 'summarize') {
      const pageList = pages ?? [docText ?? ''];
      const pagesBlock = pageList
        .map((p, i) => `### 페이지 ${i + 1}\n${p.trim() || '(텍스트 없음)'}`)
        .join('\n\n---\n\n');
      return {
        system: '당신은 문서 요약 전문가입니다. 각 페이지의 핵심 내용을 간결하고 명확하게 요약합니다.',
        prompt: `다음은 문서의 페이지별 텍스트입니다. 각 페이지의 핵심 내용을 2~4개의 불릿으로 요약해주세요.

## 출력 형식

### 페이지 1
- 핵심 내용 1
- 핵심 내용 2

### 페이지 2
- ...

---

## 문서 내용 (총 ${pageList.length}페이지)

${pagesBlock}`,
      };
    }
    if (action === 'evaluate') {
      const pageList = pages ?? [docText ?? ''];
      return {
        system: PORTFOLIO_EVALUATION_SYSTEM_PROMPT,
        prompt: buildPortfolioEvaluationPrompt(pageList),
      };
    }

    return { system: '당신은 문서 분석 전문가입니다.', prompt: text };
  }
}
