import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';

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
      const pagesBlock = pageList
        .map((p, i) => `### 📄 페이지 ${i + 1}\n${p.trim() || '(텍스트 없음 — 이미지 위주 페이지일 가능성)'}`)
        .join('\n\n---\n\n');
      return {
        system: `당신은 10년차 시니어 포트폴리오 리뷰어이자 채용 심사 전문가입니다.
지원자의 포트폴리오를 페이지 단위로 엄격하게 분석하여 합격 가능성을 높이는 구체적 피드백을 제공합니다.`,
        prompt: `# 포트폴리오 페이지 분석 요청

다음은 페이지별로 추출된 포트폴리오 텍스트입니다. 각 페이지를 개별 분석한 뒤 종합 평가를 작성하세요.

## 평가 기준 (각 25점, 합계 100점)

1. **직무 적합성** — 지원 직무·분야가 명확한가
2. **콘텐츠 완성도** — STAR 구조 + 정량적 성과
3. **시각·구조적 완성도** — 정보 위계, 가독성
4. **차별화·임팩트** — 독창성, 첫인상

## 출력 형식

# 포트폴리오 평가

## 종합

| 항목 | 점수 | 등급 |
|------|------|------|
| 직무 적합성 | __/25 | A/B/C/D |
| 콘텐츠 완성도 | __/25 | A/B/C/D |
| 시각·구조적 완성도 | __/25 | A/B/C/D |
| 차별화·임팩트 | __/25 | A/B/C/D |
| **종합** | **__/100** | **__** |

**합격 가능성**: 매우 높음 / 높음 / 보통 / 낮음 / 매우 낮음
**한 줄 총평**: (한 문장)

---

## 페이지별 분석

### 페이지 1
- **좋은 점**: (구체적)
- **문제점**: (원문 인용 가능)
- **개선 제안**: (실행 가능한 액션)

(... 모든 페이지 반복)

---

## 우선 개선 5가지
1. ...

---

## 분석 대상 포트폴리오 (총 ${pageList.length}페이지)

${pagesBlock}`,
      };
    }

    return { system: '당신은 문서 분석 전문가입니다.', prompt: text };
  }
}
