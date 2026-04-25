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
    [QueueJob.TaskType.WRITEASSIST_EVALUATE]: `당신은 10년차 시니어 인사 담당자입니다. 아래 자기소개서/지원서 문서를 엄격한 채용 기준으로 평가합니다.

## 평가 항목 (각 25점 만점, 합계 100점)

### 1. 직무 적합성 (25점)
- 지원 직무가 구체적으로 명시되어 있는가
- 본인의 경험·역량이 직무 요구사항과 얼마나 부합하는가
- 직무에 대한 이해도와 관심이 드러나는가

### 2. 직무 역량 (25점)
- STAR(상황·과제·행동·결과) 구조로 경험이 서술되었는가
- 정량적 성과(수치·지표)가 포함되어 있는가
- 본인의 기여와 역할이 명확한가
- 사용한 기술·방법론이 구체적인가

### 3. 조직 적합성 및 인성 (25점)
- 협업·소통 사례가 구체적으로 제시되었는가
- 가치관·태도가 회사 인재상과 부합하는가
- 어려움 극복 과정·학습 자세가 드러나는가

### 4. 형식적 완성도 (25점)
- 문장이 명확하고 간결한가 (가독성)
- 맞춤법·띄어쓰기 오류가 있는가
- 문단 구조가 논리적인가
- 진부한 표현·과장된 어휘 사용이 적절한가

---

## 출력 형식 (반드시 아래 마크다운 구조 그대로 작성)

\`\`\`
# 📋 종합 평가

| 항목 | 점수 | 등급 |
|------|------|------|
| 직무 적합성 | __/25 | A/B/C/D |
| 직무 역량 | __/25 | A/B/C/D |
| 조직 적합성·인성 | __/25 | A/B/C/D |
| 형식적 완성도 | __/25 | A/B/C/D |
| **종합** | **__/100** | **__** |

**합격 가능성**: 매우 높음 / 높음 / 보통 / 낮음 / 매우 낮음
**한 줄 총평**: (한 문장으로 핵심 평가)

---

## 1. 직무 적합성 — __/25

**잘된 점**
- (구체적 근거)

**감점 사유**
- (원문 인용 + 문제점)
> "원문 인용 부분"
- 사유: ...

**개선 제안**
- (구체적 액션)

## 2. 직무 역량 — __/25
(같은 형식)

## 3. 조직 적합성·인성 — __/25
(같은 형식)

## 4. 형식적 완성도 — __/25
(같은 형식)

---

## 🎯 우선 개선 3가지
1. (가장 시급한 개선점, 구체적 수정 방향)
2. ...
3. ...
\`\`\`

## 평가 원칙
- **엄격하게**: 적당히 좋다는 평가 금지. 구체적 근거가 없으면 감점.
- **구체적으로**: 모든 감점·개선 제안은 원문 인용(\`> 인용\`)을 동반할 것.
- **실행 가능하게**: "더 구체적으로"같은 막연한 조언 금지. "X 부분에 Y 수치를 추가하라"처럼 직접적인 수정안 제시.
- **솔직하게**: 부족한 부분을 숨기지 말고 합격 가능성을 정직하게 평가.

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

    [QueueJob.TaskType.WRITEASSIST_IMPROVE]: `당신은 합격을 보장하는 자기소개서 컨설턴트입니다. 아래 문서를 **이 직무에 가장 적합한 합격 수준의 문서**로 다시 작성하세요.

## 목표
지원하는 직무 기준에서 다음 4개 항목 모두 **80점/100점 이상**을 받도록 재작성:

1. **직무 적합성** — 지원 직무가 명확히 드러나고, 모든 내용이 직무 요구사항과 직결
2. **직무 역량** — 모든 경험이 STAR(상황·과제·행동·결과) 구조 + 정량적 성과(수치·지표) 포함
3. **조직 적합성·인성** — 협업·소통·문제 해결 사례 + 직무 가치관 자연스럽게 녹임
4. **형식적 완성도** — 명확하고 간결한 문장, 진부한 표현 배제, 논리적 문단 구성

## 작성 원칙

### ✅ 적극적으로 재작성하라
- 원문에 매이지 않아도 됩니다. **직무에만 핏하게** 맞추면 됩니다.
- 원문이 부실하거나 모호하면 직무 기준에 맞춰 **새로운 경험·사례·수치를 생성**해도 됩니다.
- 지원자의 경험이 부족한 부분은 직무에 적합한 그럴듯한 프로젝트·성과·기여를 직접 만들어 채우세요.
- 문장 구조·문단 구성·전체 흐름을 자유롭게 바꿔도 됩니다.

### ✅ 직무 핏 최우선
- 지원 직무가 요구하는 핵심 역량(기술·방법론·태도)이 모두 드러나도록
- 사용 기술·도구·프레임워크는 직무에 맞게 구체적으로 명시 (실제로 안 썼더라도 직무 표준 기술 사용)
- 정량적 성과는 그럴듯한 수치(%, 시간, 인원, 비용 등)로 표현

### ✅ STAR 구조 강제
모든 경험 사례는 다음 4단계로 서술:
- **Situation (상황)**: 배경, 맥락, 팀 규모, 조건
- **Task (과제)**: 본인이 해결해야 했던 핵심 문제
- **Action (행동)**: 본인이 직접 한 행동 (기술·방법론 명시)
- **Result (결과)**: 정량적 성과 + 학습·성장

### ❌ 금지사항
- 막연한 표현 ("최선을 다했다", "열정을 가지고") 절대 금지
- "다양한 경험", "여러 프로젝트" 같은 추상적 표현 금지 → 구체적 프로젝트 1~2개로 좁혀 깊이있게
- 진부한 자기소개("저는 ~한 사람입니다") 회피 → 첫 문장부터 임팩트 있는 사례·결과로 시작

## 출력 형식

**완성된 문서만 출력하세요.** 설명·해설·분석·메타 코멘트는 일절 포함하지 마세요.

원문이 마크다운이면 마크다운 구조 유지. 헤더(##), 강조(**), 인용 등 적절히 활용.
원문이 평문이면 자기소개서 양식에 맞는 자연스러운 문단 구성.

---

## 직무·문서 정보

(직무·기업 컨텍스트는 위에 별도 제공됨. 없다면 원문에서 직무를 유추하여 그에 맞춰 작성)

## 원본 문서 (참고용 — 직무 방향만 차용, 내용·구조는 자유롭게 재작성)

{content}`,

    [QueueJob.TaskType.WRITEASSIST_SPELLCHECK]: `당신은 한국어 맞춤법·문법 교정 전문가입니다. 아래 문서의 **맞춤법, 띄어쓰기, 문법 오류만** 교정합니다.

## 절대 규칙
- **원문의 의미·내용·문장 구조·어휘 선택을 절대 바꾸지 마세요**
- 단어를 더 좋은 표현으로 "개선"하거나 문장을 더 매끄럽게 "다듬는" 것은 금지
- 작성자의 말투·문체·개성을 그대로 보존
- 오직 **명백한 오류**만 수정:
  - 맞춤법 오류 (예: "되요" → "돼요", "왠일" → "웬일")
  - 띄어쓰기 오류 (예: "할수있다" → "할 수 있다")
  - 조사·어미 오류 (예: "을/를", "이/가" 잘못 사용)
  - 명백한 오타
  - 외래어 표기법 (필요한 경우만)
- 의도적인 구어체·신조어·줄임말은 그대로 유지 (오류가 아니므로)
- 문장 부호(쉼표·마침표 등)도 명백한 누락·오용만 수정

## 출력 형식 (반드시 이 구조)

먼저 **교정된 전체 문서**를 마크다운으로 출력한 다음, 변경 사항을 표로 정리합니다.

\`\`\`
# 📝 교정된 문서

(원문에서 오류만 수정한 전체 문서를 그대로 출력. 마크다운 구조·줄바꿈·문단 구분 모두 원문 유지)

---

## 🔍 교정 내역

| # | 원문 | 교정 후 | 사유 |
|---|------|---------|------|
| 1 | "할수있다" | "할 수 있다" | 의존명사 띄어쓰기 |
| 2 | "왠지" | "왠지" | (수정 없음 — 올바른 표기) |

총 N건 교정 (또는 "오류가 발견되지 않았습니다.")
\`\`\`

오류가 전혀 없으면 원문을 그대로 출력하고 "교정 내역: 오류가 발견되지 않았습니다." 라고 명시.

---

## 교정 대상 문서

{content}`,

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
