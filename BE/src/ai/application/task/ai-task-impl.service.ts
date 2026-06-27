import { Injectable } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

@Injectable()
export class AiTaskImplService {
  constructor(private readonly aiProvider: AiProviderService) {}

  async evaluateConfidence(
    answer: string,
    context: string,
    model: string,
  ): Promise<{ score: number; reason: string }> {
    const evalPrompt = `## 역할
당신은 AI 리서치 답변의 신뢰도를 평가하는 전문가입니다.

## 평가 대상
### 웹 검색 소스
${context}

### AI 생성 답변
${answer}

## 평가 기준
1. 출처 수와 다양성 (출처가 많고 다양할수록 높음)
2. 교차 검증 일치도 (여러 소스가 같은 내용을 지지할수록 높음)
3. 답변 내 불확실 표현 비율 (낮을수록 높음)
4. 검색 결과와 답변의 직접적 연관성

## 출력 형식
반드시 아래 JSON만 반환하세요 (마크다운 코드블록 없이 순수 JSON):
{"score": 0~100 사이 정수, "reason": "점수 근거를 1~2문장으로 한국어 설명"}`;

    let raw = '';
    try {
      ({ text: raw } = await this.aiProvider.call(model, '', evalPrompt, {
        useBuiltinSearch: false,
      }));
      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      return JSON.parse(cleaned) as { score: number; reason: string };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[confidence] 파싱 실패:', errMsg, '\nraw:', raw);
      return {
        score: 50,
        reason: `신뢰도 평가 중 오류가 발생했습니다. (${errMsg})${raw ? ` / 원본 응답: ${raw.slice(0, 200)}` : ''}`,
      };
    }
  }

  async improveTask(
    topic: string,
    title: string,
    prompt: string,
    model: string,
  ): Promise<{ title: string; prompt: string }> {
    const evalPrompt = `주제: "${topic}"

현재 조사 항목:
- 제목: "${title}"
- 검색 프롬프트: "${prompt}"

위 조사 항목을 더 구체적이고 효과적인 검색을 위해 개선해주세요.
반드시 아래 JSON 형식으로만 반환하세요 (마크다운 코드블록 없이 순수 JSON):
{
  "title": "개선된 제목 (10자 이내, 한국어)",
  "prompt": "개선된 검색 프롬프트 (영어로, 검색 엔진에 입력할 형태로)"
}`;

    try {
      const { text: raw } = await this.aiProvider.call(model, '', evalPrompt);
      return JSON.parse(raw) as { title: string; prompt: string };
    } catch {
      return { title, prompt };
    }
  }

  async generateTitle(
    topic: string,
    tasks: Array<{ title: string }>,
    model: string,
  ): Promise<{ title: string }> {
    const taskList = tasks.map((t) => `- ${t.title}`).join('\n');
    const prompt = `리서치 주제: "${topic}"

조사 항목:
${taskList}

위 리서치의 핵심을 담은 간결한 제목을 생성해주세요.
- 20자 이내 한국어
- 구체적이고 명확하게
- 검색어가 아닌 제목 형식으로 (예: "AI 반도체 시장 동향 분석")

반드시 아래 JSON만 반환하세요 (마크다운 코드블록 없이 순수 JSON):
{"title": "생성된 제목"}`;

    let raw = '';
    try {
      ({ text: raw } = await this.aiProvider.call(model, '', prompt, {
        useBuiltinSearch: false,
      }));
      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      return JSON.parse(cleaned) as { title: string };
    } catch {
      return { title: topic.slice(0, 20) };
    }
  }

  async chatTasks(
    topic: string,
    tasks: Array<{ id: number; title: string; webSearchPrompt: string }>,
    message: string,
    model: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<{ tasks: typeof tasks; reply: string }> {
    const historyText = history.length
      ? history
          .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
          .join('\n') + '\n\n'
      : '';

    const evalPrompt = `리서치 주제: "${topic}"

현재 조사 항목 (JSON):
${JSON.stringify(
  tasks.map((t) => ({
    id: t.id,
    title: t.title,
    webSearchPrompt: t.webSearchPrompt,
  })),
  null,
  2,
)}

${historyText}사용자 요청: ${message}

사용자 요청에 따라 조사 항목을 수정하세요. 항목 추가/수정/삭제 가능합니다.
새 항목의 id는 기존 최대 id 값보다 큰 정수를 사용하세요.
반드시 순수 JSON만 반환하세요 (마크다운 코드블록 없이):
{"tasks": [{"id": <정수>, "title": "제목 (10자 이내)", "webSearchPrompt": "검색 프롬프트 (영어 권장)"}], "reply": "수행한 작업을 한국어로 간결하게"}`;

    try {
      const { text: raw } = await this.aiProvider.call(model, '', evalPrompt, {
        useBuiltinSearch: false,
      });
      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
      return JSON.parse(cleaned) as { tasks: typeof tasks; reply: string };
    } catch {
      return { tasks, reply: '처리 중 오류가 발생했습니다.' };
    }
  }
}
