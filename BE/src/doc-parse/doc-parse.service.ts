import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../ai/application/ai-provider.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export interface DocAskResult {
  answer: string;
}

@Injectable()
export class DocParseService {
  constructor(private readonly aiProvider: AiProviderService) {}

  async extractText(buffer: Buffer, mimetype: string): Promise<{ text: string; pageCount: number }> {
    if (mimetype === 'application/pdf' || mimetype === 'application/octet-stream') {
      const parsed = await pdfParse(buffer);
      return { text: parsed.text, pageCount: parsed.numpages };
    }
    // Plain text fallback
    return { text: buffer.toString('utf-8'), pageCount: 1 };
  }

  async ask(
    docText: string,
    question: string,
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const system = `당신은 문서 분석 전문가입니다. 사용자가 제공한 문서 내용을 기반으로 질문에 답변합니다.
답변은 한국어로 작성하고, 문서에 없는 내용은 추측하지 마세요.
문서 내용에서 관련 부분을 인용하거나 참조하여 답변하세요.`;

    const prompt = `=== 문서 내용 ===
${docText.slice(0, 30000)}

=== 질문 ===
${question}`;

    const answer = await this.aiProvider.call(aiModel, system, prompt);
    return { answer };
  }

  async quickAction(
    docText: string,
    action: 'translate' | 'summarize' | 'explain' | 'keywords',
    aiModel = 'claude-sonnet-4-6',
  ): Promise<DocAskResult> {
    const prompts: Record<string, string> = {
      translate: '이 문서의 내용을 한국어로 번역해주세요. 원문의 구조와 형식을 최대한 유지하세요.',
      summarize: '이 문서의 핵심 내용을 3~5개의 불릿 포인트로 요약해주세요.',
      explain: '이 문서의 내용을 쉬운 말로 설명해주세요. 전문 용어가 있다면 풀어서 설명하세요.',
      keywords: '이 문서에서 핵심 키워드와 주요 개념을 추출하고 각각 간략히 설명해주세요.',
    };
    return this.ask(docText, prompts[action], aiModel);
  }
}
