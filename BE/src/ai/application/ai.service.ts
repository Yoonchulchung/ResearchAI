import { Injectable } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { getProvider, AIProvider } from 'src/ai/domain/models';
import { InvalidAiTypeException } from 'src/shared/exceptions/invalid-ai-type.exception';

@Injectable()
export class AiService {
  constructor(private readonly aiProvider: AiProviderService) {}

  /**
   * 단순 AI 호출: 검색 없이 AI에게 직접 질문.
   */
  async call(
    aiModel: string,
    system: string,
    prompt: string,
    opts?: { useBuiltinSearch?: boolean },
  ): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
  }> {
    return this.aiProvider.call(aiModel, system, prompt, opts);
  }

  /**
   * AI 에이전트 루프: web_search 도구를 제공하여 AI가 필요 시 검색을 결정하게 함.
   * - Claude (Anthropic): tool_use API
   * - OpenAI / Ollama: function calling API (OpenAI 호환 format)
   * - Gemini: 미지원 (호출 금지)
   */
  async runAgenticLoop(
    aiModel: string,
    system: string,
    prompt: string,
    searchFn: (query: string) => Promise<string>,
    maxIterations = 5,
    signal?: AbortSignal,
    /** 추가 툴 정의 (Anthropic/OpenAI 포맷 각각) */
    extraTools?: { anthropic: object[]; openai: object[] },
    /** 툴 이름 → 핸들러: 반환값은 AI에게 돌려줄 텍스트 + 구조화 데이터 */
    toolHandlers?: Record<
      string,
      (input: unknown) => Promise<{ text: string; data?: unknown }>
    >,
  ): Promise<{
    result: string;
    searchLog: Array<{ query: string; result: string }>;
    toolData: Record<string, unknown[]>;
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
  }> {
    const searchLog: Array<{ query: string; result: string }> = [];
    const toolData: Record<string, unknown[]> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedFees = 0;
    const provider = getProvider(aiModel);

    const anthropicWebSearch = {
      name: 'web_search',
      description:
        '웹에서 최신 정보를 검색합니다. 학습 데이터에 없는 최신 정보나 특정 사실 확인이 필요한 경우에만 호출하세요.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색할 쿼리 (영어 권장)' },
        },
        required: ['query'],
      },
    };
    const openaiWebSearch = {
      type: 'function',
      function: {
        name: 'web_search',
        description: anthropicWebSearch.description,
        parameters: anthropicWebSearch.input_schema,
      },
    };

    const tools =
      provider === AIProvider.ANTHROPIC
        ? [anthropicWebSearch, ...(extraTools?.anthropic ?? [])]
        : [openaiWebSearch, ...(extraTools?.openai ?? [])];

    const messages: any[] = [{ role: 'user', content: prompt }];

    for (let i = 0; i < maxIterations; i++) {
      const result = await this.aiProvider.call(aiModel, system, messages, {
        tools,
        signal,
      });
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      estimatedFees += result.estimatedFees;
      if (!result.toolCalls?.length || result.stopReason === 'end_turn') {
        return {
          result: result.text,
          searchLog,
          toolData,
          inputTokens,
          outputTokens,
          estimatedFees,
        };
      }

      if (provider === AIProvider.ANTHROPIC) {
        const content: any[] = [];
        if (result.text) content.push({ type: 'text', text: result.text });
        for (const tc of result.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        messages.push({ role: 'assistant', content });

        const toolResults: any[] = [];
        for (const tc of result.toolCalls) {
          let toolResponse: string;
          if (tc.name === 'web_search') {
            const query = (tc.input as { query: string }).query;
            toolResponse = await searchFn(query);
            searchLog.push({ query, result: toolResponse });
          } else if (toolHandlers?.[tc.name]) {
            const { text, data } = await toolHandlers[tc.name](tc.input);
            toolResponse = text;
            if (data !== undefined) {
              toolData[tc.name] = [...(toolData[tc.name] ?? []), data];
            }
          } else {
            toolResponse = `Unknown tool: ${tc.name}`;
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: toolResponse,
          });
        }
        messages.push({ role: 'user', content: toolResults });
      } else if (
        provider === AIProvider.OPENAI ||
        provider === AIProvider.OLLAMA
      ) {
        messages.push({
          role: 'assistant',
          content: result.text || null,
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        });
        for (const tc of result.toolCalls) {
          let toolResponse: string;
          if (tc.name === 'web_search') {
            const query = (tc.input as { query: string }).query;
            toolResponse = await searchFn(query);
            searchLog.push({ query, result: toolResponse });
          } else if (toolHandlers?.[tc.name]) {
            const { text, data } = await toolHandlers[tc.name](tc.input);
            toolResponse = text;
            if (data !== undefined) {
              toolData[tc.name] = [...(toolData[tc.name] ?? []), data];
            }
          } else {
            toolResponse = `Unknown tool: ${tc.name}`;
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResponse,
          });
        }
      } else {
        throw new InvalidAiTypeException(aiModel);
      }
    }

    const lastAssistant = messages.filter((m) => m.role === 'assistant').at(-1);
    const lastText =
      typeof lastAssistant?.content === 'string'
        ? lastAssistant.content
        : Array.isArray(lastAssistant?.content)
          ? (lastAssistant.content.find((c: any) => c.type === 'text')?.text ??
            '')
          : '';
    return {
      result: lastText,
      searchLog,
      toolData,
      inputTokens,
      outputTokens,
      estimatedFees,
    };
  }

  /**
   * AI 답변과 검색 컨텍스트를 기반으로 신뢰도를 평가한다.
   */
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

  /**
   * 조사 항목(제목 + 검색 프롬프트)을 AI로 개선한다.
   */
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

  /**
   * 문서 작성 AI 어시스턴트: 현재 문서 내용과 지시사항을 받아 새 내용을 생성한다.
   */
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

    try {
      const { text } = await this.aiProvider.call(model, systemPrompt, prompt, {
        useBuiltinSearch: false,
      });
      return { result: text };
    } catch (err) {
      throw err;
    }
  }

  /**
   * 리서치 주제와 태스크 목록으로 세션 제목을 생성한다.
   */
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

  /**
   * 채팅을 통해 조사 항목을 수정한다.
   */
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
