import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import { QueueJob } from '../../domain/queue-job.model';

export interface WriteAssistExtras {
  instruction?: string;                               // WRITEASSIST(커스텀) 전용
  experiences?: { title: string; content: string }[];
  companyCtx?: string;
}

@Injectable()
export class WriteAssistExecutorService {
  constructor(private readonly aiProvider: AiProviderService) {}

  // ── 액션별 프롬프트 템플릿 ──────────────────────────────────────────────
  private static readonly PROMPTS: Partial<Record<QueueJob.TaskType, string>> = {
    [QueueJob.TaskType.WRITEASSIST_EVALUATE]: `당신은 전문 글쓰기 컨설턴트입니다. 아래 문서를 다음 항목에 따라 컨설팅 보고서 형식으로 평가해주세요.

## 평가 항목
1. **반복 단어 사용** — 같은 단어·표현이 과도하게 반복되는 구간을 찾아 원문을 인용하고 대안 표현을 제안해주세요
2. **진부한 표현** — "최선을 다하다", "열정을 가지고" 등 식상하거나 의미가 희석된 표현을 원문 인용과 함께 지적해주세요
3. **애매한 표현** — 독자가 오해하거나 의미가 불분명한 문장을 원문 인용과 함께 구체적인 수정 방향을 제안해주세요
4. **지나치게 긴 문장** — 한 문장에 내용이 과도하게 압축되어 가독성을 해치는 구간을 원문 인용 후 분리 방법을 제안해주세요
5. **논리적인 흐름** — 문단 간 연결이 자연스러운지, 주장과 근거가 논리적으로 이어지는지, 비약이나 모순이 없는지 평가해주세요
6. **질문에 적절한 내용** — 글의 주제·질문 의도에 맞는 내용을 담고 있는지, 핵심에서 벗어난 불필요한 내용이 있는지 평가해주세요
7. **종합 개선 제안** — 위 분석을 바탕으로 우선순위가 높은 개선 방향 3가지를 제안해주세요

각 항목에서 실제 원문을 인용(> 인용 형식)하여 근거를 명확히 하고, 마지막에 전체 완성도 점수(10점 만점)와 한 줄 종합 의견을 작성해주세요.

---
## 평가 대상 문서

{content}`,

    [QueueJob.TaskType.WRITEASSIST_PLAGIARISM]: `당신은 AI 생성 텍스트 감지 전문가입니다. 아래 문서를 분석하여 AI 표절 가능성을 평가해주세요.

## 분석 항목
1. **AI 생성 가능성** — 문장 패턴, 반복적 구조, 지나치게 완성된 문체 등 AI 특징 여부 (0~100%)
2. **표현 다양성** — 어휘·문장 구조의 다양성 및 자연스러운 개인 특색 유무
3. **의심 구간** — AI가 작성했을 가능성이 높은 문장이나 단락을 인용하여 지적
4. **독창성 점수** — 글 전체의 독창성 수준 (10점 만점)
5. **개선 권고** — 더 인간적이고 개성 있는 글로 개선하기 위한 구체적 제안

각 항목에 근거와 함께 답하고, 마지막에 종합 판정(인간 작성 / 일부 AI 보조 / AI 주도)을 내려주세요.

---
## 검사 대상 문서

{content}`,

    [QueueJob.TaskType.WRITEASSIST_CONTINUE]:
      '아래 문서의 내용을 자연스럽게 이어서 작성해주세요. 문서의 흐름과 스타일을 유지하면서 다음 내용을 작성하세요:\n\n{content}',

    [QueueJob.TaskType.WRITEASSIST_SECTION]:
      '아래 문서에 추가할 새로운 섹션을 제안하고 작성해주세요. 문서의 맥락에 맞는 주제를 선택하세요:\n\n{content}',

    [QueueJob.TaskType.WRITEASSIST_IMPROVE]:
      '아래 문서의 문장을 더 명확하고 전문적으로 개선해주세요. 내용은 유지하되 표현을 다듬어주세요:\n\n{content}',

    [QueueJob.TaskType.WRITEASSIST_SUMMARIZE]:
      '아래 문서의 핵심 내용을 간결하게 요약해주세요:\n\n{content}',
  };

  async execute(
    taskType: QueueJob.TaskType,
    content: string,
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    extras?: WriteAssistExtras,
  ): Promise<string> {
    const instruction = this.buildInstruction(taskType, content, extras);

    const systemPrompt = `당신은 전문적인 문서 작성 AI 어시스턴트입니다.
- 마크다운 형식으로 작성합니다
- 명확하고 전문적인 한국어를 사용합니다
- 기존 문서의 스타일과 일관성을 유지합니다
- 요청된 내용만 반환하고 불필요한 설명은 하지 않습니다`;

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(model, systemPrompt, [{ role: 'user' as const, content: instruction }])) {
      if (signal?.aborted) break;
      fullText += chunk;
      onChunk(chunk);
    }
    return fullText;
  }

  private buildInstruction(
    taskType: QueueJob.TaskType,
    content: string,
    extras?: WriteAssistExtras,
  ): string {
    // 커스텀 자유 입력
    if (taskType === QueueJob.TaskType.WRITEASSIST) {
      const expContext = this.buildExpContext(extras?.experiences);
      return `## 현재 문서 내용\n${content.trim() || '(빈 문서)'}\n\n## 요청사항\n${(extras?.companyCtx ?? '') + expContext + (extras?.instruction ?? '')}\n\n위 요청에 따라 마크다운으로 작성해주세요.`;
    }

    // 액션별 템플릿
    const template = WriteAssistExecutorService.PROMPTS[taskType];
    if (!template) throw new Error(`알 수 없는 taskType: ${taskType}`);

    const expContext = this.buildExpContext(extras?.experiences);
    const body = template.replace('{content}', content.trim() || '(빈 문서)');
    return (extras?.companyCtx ?? '') + expContext + body;
  }

  private buildExpContext(experiences?: { title: string; content: string }[]): string {
    if (!experiences || experiences.length === 0) return '';
    return `## 참고할 나의 경험\n${experiences.map((e) => `### ${e.title}\n${e.content}`).join('\n\n')}\n\n---\n\n`;
  }
}
