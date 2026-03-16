import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { callAnthropic } from '../infrastructure/provider/anthropic.ai';
import { callOpenAI } from '../infrastructure/provider/openai.ai';
import { callGoogle } from '../infrastructure/provider/google.ai';
import { callOllama, streamOllama } from '../infrastructure/provider/ollama.ai';
import { MODELS, AI_MODEL_PREFIX, getProvider, AIProvider, GEMINI_ROLE } from '../domain/models';
import { TokenHistoryRepository } from '../../overview/domain/repository/token-history.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class AiProviderService {
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private readonly google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(private readonly tokenHistoryRepository: TokenHistoryRepository) {}

  async callWithUsage(
    aiModel: string,
    system: string,
    prompt: string,
    opts?: { useBuiltinSearch?: boolean },
  ): Promise<{ text: string; inputTokens: number; outputTokens: number; estimatedFees: number }> {
    if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      const text = await callOllama(aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length), system, prompt);
      return { text, inputTokens: 0, outputTokens: 0, estimatedFees: 0 };
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let text = '';

    const provider = getProvider(aiModel);
    if (provider === AIProvider.ANTHROPIC) {
      const result = await callAnthropic(this.anthropic, aiModel, system, prompt, opts?.useBuiltinSearch ?? false);
      ({ text, inputTokens, outputTokens } = result);
    } else if (provider === AIProvider.GOOGLE) {
      const result = await callGoogle(this.google, aiModel, system + '\n\n' + prompt, opts?.useBuiltinSearch ?? false);
      ({ text, inputTokens, outputTokens } = result);
    } else {
      const result = await callOpenAI(this.openai, aiModel, system, prompt);
      ({ text, inputTokens, outputTokens } = result);
    }

    const modelInfo = MODELS.find((m) => aiModel.startsWith(m.id));
    const estimatedFees = modelInfo
      ? (inputTokens / 1_000_000) * modelInfo.inputPricePer1M +
        (outputTokens / 1_000_000) * modelInfo.outputPricePer1M
      : 0;

    this.tokenHistoryRepository
      .save({ id: randomUUID(), aiModel, usedTokens: `input:${inputTokens}/output:${outputTokens}`, estimatedFees })
      .catch(() => {});

    return { text, inputTokens, outputTokens, estimatedFees };
  }

  async call(
    aiModel: string,
    system: string,
    prompt: string,
    opts?: { useBuiltinSearch?: boolean },
  ): Promise<string> {
    const useSearch = opts?.useBuiltinSearch ?? false;

    console.log(prompt);
    
    if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      return callOllama(aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length), system, prompt);
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let text = '';

    const provider = getProvider(aiModel);
    if (provider === AIProvider.ANTHROPIC) {
      const result = await callAnthropic(this.anthropic, aiModel, system, prompt, useSearch);
      ({ text, inputTokens, outputTokens } = result);
    } else if (provider === AIProvider.GOOGLE) {
      const result = await callGoogle(this.google, aiModel, system + '\n\n' + prompt, useSearch);
      ({ text, inputTokens, outputTokens } = result);
    } else {
      const result = await callOpenAI(this.openai, aiModel, system, prompt);
      ({ text, inputTokens, outputTokens } = result);
    }

    const modelInfo = MODELS.find((m) => aiModel.startsWith(m.id));
    const estimatedFees = modelInfo
      ? (inputTokens / 1_000_000) * modelInfo.inputPricePer1M +
        (outputTokens / 1_000_000) * modelInfo.outputPricePer1M
      : 0;

    this.tokenHistoryRepository
      .save({
        id: randomUUID(),
        aiModel: aiModel,
        usedTokens: `input:${inputTokens}/output:${outputTokens}`,
        estimatedFees,
      })
      .catch(() => {});

    return text;
  }

  async *stream(
    aiModel: string,
    system: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string> {
    if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      const ollamaModel = aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length);
      const prompt = messages.map((m) => `${m.role === 'assistant' ? 'AI' : '사용자'}: ${m.content}`).join('\n');
      yield* streamOllama(ollamaModel, system, prompt);
      return;
    }

    const provider = getProvider(aiModel);

    if (provider === AIProvider.ANTHROPIC) {
      const stream = this.anthropic.messages.stream({
        model: aiModel,
        max_tokens: 4000,
        system,
        messages,
      });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield chunk.delta.text;
        }
      }
    } else if (provider === AIProvider.GOOGLE) {
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? GEMINI_ROLE.MODEL : GEMINI_ROLE.USER,
        parts: [{ text: m.content }],
      }));
      const result = await this.google.models.generateContent({
        model: aiModel,
        config: { systemInstruction: system, maxOutputTokens: 4000 },
        contents,
      });
      yield result.text ?? '';
    } else {
      const completion = await this.openai.chat.completions.create({
        model: aiModel,
        max_tokens: 4000,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: true,
      });
      for await (const chunk of completion) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) yield text;
      }
    }
  }

  async getModels() {
    const models: (typeof MODELS[number] & { provider: string })[] = [...MODELS];
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = (await res.json()) as { models: { name: string }[] };
        for (const m of data.models) {
          models.push({
            id: `ollama:${m.name}`,
            name: m.name,
            provider: 'ollama',
            description: '로컬 Ollama 모델',
            inputPricePer1M: 0,
            outputPricePer1M: 0,
            contextWindow: 8192,
            webSearch: false,
          });
        }
      }
    } catch {
      // Ollama 실행 중이 아닌 경우 무시
    }
    return models;
  }

  async getRunningOllamaModels(): Promise<{ name: string; size_vram: number }[]> {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
    const data = (await res.json()) as { models: { name: string; size_vram: number }[] };
    return data.models ?? [];
  }

  async unloadOllamaModel(model: string): Promise<void> {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Ollama 오류: ${res.status}`);
  }

  /**
   * AI 에이전트 루프: web_search 도구를 제공하여 AI가 필요 시 검색을 결정하게 함.
   * - Claude (Anthropic): tool_use API
   * - OpenAI: function calling API
   * - Gemini / Ollama: 미지원 (호출 금지)
   */
  async runAgenticLoop(
    aiModel: string,
    system: string,
    prompt: string,
    searchFn: (query: string) => Promise<string>,
    maxIterations = 5,
  ): Promise<{ result: string; searchLog: Array<{ query: string; result: string }> }> {
    const searchLog: Array<{ query: string; result: string }> = [];
    const provider = getProvider(aiModel);

    if (provider === AIProvider.ANTHROPIC) {
      const tool: Anthropic.Tool = {
        name: 'web_search',
        description: '웹에서 최신 정보를 검색합니다. 학습 데이터에 없는 최신 정보나 특정 사실 확인이 필요한 경우에만 호출하세요.',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string', description: '검색할 쿼리 (영어 권장)' } },
          required: ['query'],
        },
      };
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];

      for (let i = 0; i < maxIterations; i++) {
        const response = await this.anthropic.messages.create({
          model: aiModel,
          max_tokens: 8000,
          system,
          messages,
          tools: [tool],
        });

        if (response.stop_reason === 'end_turn') {
          const text = response.content.find((c) => c.type === 'text')?.text ?? '';
          return { result: text, searchLog };
        }

        const toolUseBlocks = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          const query = (toolUse.input as { query: string }).query;
          const searchResult = await searchFn(query);
          searchLog.push({ query, result: searchResult });
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: searchResult });
        }
        messages.push({ role: 'user', content: toolResults });
      }

      // maxIterations 초과 시 마지막 텍스트 반환
      const lastText =
        (messages
          .filter((m) => m.role === 'assistant')
          .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
          .filter((c): c is Anthropic.TextBlock => typeof c === 'object' && 'type' in c && c.type === 'text')
          .at(-1)?.text) ?? '';
      return { result: lastText, searchLog };
    }

    // OpenAI (function calling)
    const tool: OpenAI.ChatCompletionTool = {
      type: 'function',
      function: {
        name: 'web_search',
        description: '웹에서 최신 정보를 검색합니다. 학습 데이터에 없는 최신 정보나 특정 사실 확인이 필요한 경우에만 호출하세요.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: '검색할 쿼리 (영어 권장)' } },
          required: ['query'],
        },
      },
    };
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ];

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.openai.chat.completions.create({
        model: aiModel,
        max_tokens: 8000,
        messages,
        tools: [tool],
      });

      const choice = response.choices[0];
      if (choice.finish_reason !== 'tool_calls') {
        return { result: choice.message.content ?? '', searchLog };
      }

      messages.push(choice.message);
      for (const call of choice.message.tool_calls ?? []) {
        if (call.type !== 'function') continue;
        const query = (JSON.parse(call.function.arguments) as { query: string }).query;
        const searchResult = await searchFn(query);
        searchLog.push({ query, result: searchResult });
        messages.push({ role: 'tool', tool_call_id: call.id, content: searchResult });
      }
    }

    // maxIterations 초과 시 마지막 assistant 메시지 반환
    const lastAssistant = messages.filter((m) => m.role === 'assistant').at(-1);
    return { result: typeof lastAssistant?.content === 'string' ? lastAssistant.content : '', searchLog };
  }

  /**
   * AI 답변과 검색 컨텍스트를 기반으로 신뢰도를 평가한다.
   * 파싱 실패 시 오류 이유를 포함한 기본값을 반환한다.
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
      raw = await this.call(model, '', evalPrompt, { useBuiltinSearch: false });
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
   * JSON 파싱 실패 시 원본 값을 그대로 반환한다.
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
      const raw = await this.call(model, '', evalPrompt);
      return JSON.parse(raw) as { title: string; prompt: string };
    } catch {
      return { title, prompt };
    }
  }

  /**
   * 채팅을 통해 조사 항목을 수정한다.
   * 사용자의 자연어 요청을 파악해 항목 추가/수정/삭제를 수행하고 결과를 반환한다.
   */
  async chatTasks(
    topic: string,
    tasks: Array<{ id: number; title: string; icon: string; webSearchPrompt: string }>,
    message: string,
    model: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<{ tasks: typeof tasks; reply: string }> {
    const historyText = history.length
      ? history.map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`).join('\n') + '\n\n'
      : '';

    const evalPrompt = `리서치 주제: "${topic}"

현재 조사 항목 (JSON):
${JSON.stringify(tasks.map((t) => ({ id: t.id, title: t.title, icon: t.icon, webSearchPrompt: t.webSearchPrompt })), null, 2)}

${historyText}사용자 요청: ${message}

사용자 요청에 따라 조사 항목을 수정하세요. 항목 추가/수정/삭제 가능합니다.
새 항목의 id는 기존 최대 id 값보다 큰 정수를 사용하세요.
반드시 순수 JSON만 반환하세요 (마크다운 코드블록 없이):
{"tasks": [{"id": <정수>, "title": "제목 (10자 이내)", "icon": "이모지", "webSearchPrompt": "검색 프롬프트 (영어 권장)"}], "reply": "수행한 작업을 한국어로 간결하게"}`;

    try {
      const raw = await this.call(model, '', evalPrompt, { useBuiltinSearch: false });
      const cleaned = raw.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim();
      return JSON.parse(cleaned) as { tasks: typeof tasks; reply: string };
    } catch {
      return { tasks, reply: '처리 중 오류가 발생했습니다.' };
    }
  }

  /** 모델별 입력 토큰 단가 ($/1M tokens). null = 알 수 없음/로컬 */
  getInputCostPer1M(model: string): number | null {
    if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) return null;
    const found = MODELS.find((m) => model.startsWith(m.id));
    return found?.inputPricePer1M ?? null;
  }
}
