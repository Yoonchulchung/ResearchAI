import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import {
  Intent,
  IntentInput,
  IntentResult,
} from 'src/research/application/intent-classifier.service';

const SYSTEM_PROMPT = `당신은 사용자의 요청을 분석해 3가지로 분류하는 AI 라우터입니다.

## 분류 기준

1. **research** — 명확한 리서치 주제 (웹 검색 + 심층 분석 필요)
   - 특정 주제의 현황/트렌드/비교/분석 요청
   - 조건: 무엇을·언제·어디서 가운데 핵심 정보가 명확
   - 예: "2025년 생성형 AI 시장 트렌드", "테슬라 최신 실적 분석"

2. **clarify** — 모호하거나 정보가 부족해 추가 질문이 필요
   - 주제가 광범위/모호/다의적
   - 어떤 관점·범위·기간인지 명확하지 않음
   - 예: "AI", "좋은 책 추천", "프로젝트"

3. **chat** — 단순 대화/간단한 질문 (리서치 불필요)
   - 인사, 기능 문의, 정의 확인, 간단한 계산/번역 등
   - 예: "안녕", "이 서비스 어떻게 써?", "React가 뭐야?"

## 출력 형식 (반드시 JSON만, 다른 텍스트 금지)

\`\`\`json
{
  "intent": "research" | "clarify" | "chat",
  "message": "사용자에게 보일 답변",
  "refinedTopic": "research일 때 정제된 리서치 주제 (그 외에는 생략)"
}
\`\`\`

## message 작성 가이드

- **research**: "다음 주제로 리서치를 시작하겠습니다: ..." 같은 짧은 확인 (1~2문장)
- **clarify**: 모호한 부분을 짚어 구체적으로 물어보는 질문 (1~3문장)
  - 예: "어떤 관점에서 보고 싶으세요? 시장 규모, 주요 플레이어, 기술 동향 등 중에서 선택해주세요."
- **chat**: 질문에 대한 직접적인 답변 (친절하고 간결하게)

## refinedTopic 작성 가이드 (research일 때만)

- 사용자의 대화 전체 맥락을 반영해 리서치하기 좋은 구체적 주제로 정제
- 원본 주제가 이미 충분히 명확하면 그대로 사용 가능

한국어로 응답하세요. JSON 외 다른 텍스트(설명, 마크다운 코드블록 등)를 절대 출력하지 마세요.`;

@Injectable()
export class IntentClassifierImplService {
  private readonly logger = new Logger(IntentClassifierImplService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async classify(input: IntentInput): Promise<IntentResult> {
    const historyBlock = (input.history ?? [])
      .map((m) => `[${m.role === 'user' ? '사용자' : 'AI'}] ${m.content}`)
      .join('\n');

    const userPrompt = historyBlock
      ? `이전 대화:\n${historyBlock}\n\n현재 요청: ${input.topic}`
      : `요청: ${input.topic}`;

    const model = input.localAIModel?.trim() || '';

    const { text } = await this.aiProvider.call(
      model,
      SYSTEM_PROMPT,
      userPrompt,
      { caller: 'IntentClassifier' },
    );

    this.logger.log(
      `[IntentClassifier] 응답 원문: ${text.slice(0, 500).replace(/\n/g, ' ')}`,
    );

    const parsed = this.tryParseJson(text);
    if (
      parsed &&
      (parsed.intent === 'chat' ||
        parsed.intent === 'research' ||
        parsed.intent === 'clarify')
    ) {
      const message =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : this.defaultMessageFor(parsed.intent as Intent, input.topic);
      return {
        intent: parsed.intent as Intent,
        message,
        refinedTopic:
          typeof parsed.refinedTopic === 'string' && parsed.refinedTopic.trim()
            ? parsed.refinedTopic.trim()
            : undefined,
      };
    }

    this.logger.warn(
      `[IntentClassifier] JSON 파싱 실패, chat으로 폴백. 응답 일부: ${text.slice(0, 200)}`,
    );
    return {
      intent: 'chat',
      message:
        text.trim() ||
        '죄송합니다. 요청을 이해하지 못했습니다. 다시 말씀해 주세요.',
    };
  }

  private defaultMessageFor(intent: Intent, topic: string): string {
    if (intent === 'research')
      return `"${topic}" 주제로 리서치를 시작하겠습니다.`;
    if (intent === 'clarify')
      return '조금 더 구체적으로 설명해주실 수 있을까요?';
    return '네, 무엇을 도와드릴까요?';
  }

  private tryParseJson(
    text: string,
  ): { intent?: string; message?: string; refinedTopic?: string } | null {
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
