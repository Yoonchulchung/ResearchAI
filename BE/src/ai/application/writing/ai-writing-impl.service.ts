import { Injectable } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

@Injectable()
export class AiWritingImplService {
  constructor(private readonly aiProvider: AiProviderService) {}

  async writeAssist(
    content: string,
    instruction: string,
    model: string,
  ): Promise<{ result: string }> {
    const systemPrompt = `당신은 전문적인 문서 작성 AI 어시스턴트입니다.
- 마크다운 형식으로 작성합니다
- 명확하고 전문적인 한국어를 사용합니다
- 기존 문서의 스타일과 일관성을 유지합니다
- 요청된 내용만 반환하고 불필요한 설명은 하지 않습니다`;

    const prompt = `## 현재 문서 내용
${content.trim() || '(빈 문서)'}

## 요청사항
${instruction}

위 요청에 따라 마크다운으로 작성해주세요.`;

    const { text } = await this.aiProvider.call(model, systemPrompt, prompt, {
      useBuiltinSearch: false,
    });
    return { result: text };
  }
}
