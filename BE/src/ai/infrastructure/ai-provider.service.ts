import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type { ToolCallResult } from './provider/anthropic.ai';
import { callAnthropic, streamAnthropic } from './provider/anthropic.ai';
import { callOpenAI, streamOpenAI } from './provider/openai.ai';
import { callGoogle, streamGoogle } from './provider/google.ai';
import { callOllama, streamOllama, getOllamaLocalModels, getOllamaRunningModels, unloadOllamaModel, OllamaTool, OllamaInsufficientMemoryError } from './provider/ollama.ai';
import { getLlamaCppClient, getLlamaCppModels } from './provider/llama-cpp.ai';
import { callGroq, streamGroq } from './provider/groq.ai';
export type { VlmMessage, ImageContentBlock, VlmContent } from './provider/vlm.types';
import { MODELS, AI_MODEL_PREFIX, getProvider, AIProvider } from '../domain/models';
import { InvalidAiTypeException } from '../../shared/exceptions/invalid-ai-type.exception';
import { TokenHistoryRepository } from '../../overview/domain/repository/token-history.repository';
import { AiCallLogRepository } from '../domain/repository/ai-call-log.repository';
import { requestContext, DEFAULT_AI_MODEL, DEFAULT_GOOGLE_API_KEY, DEFAULT_GROQ_API_KEY, DEFAULT_GROQ_MODEL } from '../../shared/request-context';
import { randomUUID } from 'crypto';
import { UndefinedAiAPIException } from '../../shared/exceptions/undefined-ai-api.exception';


/** Default Google 키(free tier) 전용 RPM throttle — 분당 12회(5초 간격) */
class DefaultGoogleRateLimiter {
  private readonly minIntervalMs: number;
  private lastCallMs = 0;
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(rpm = 12) {
    this.minIntervalMs = Math.ceil(60_000 / rpm);
  }

  wait(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (!this.processing) this.flush();
    });
  }

  private flush() {
    if (this.queue.length === 0) { this.processing = false; return; }
    this.processing = true;
    const delay = Math.max(0, this.lastCallMs + this.minIntervalMs - Date.now());
    setTimeout(() => {
      this.lastCallMs = Date.now();
      const next = this.queue.shift();
      if (next) next();
      this.flush();
    }, delay);
  }
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  private readonly defaultGoogle = new GoogleGenAI({ apiKey: DEFAULT_GOOGLE_API_KEY() });
  private readonly defaultGoogleLimiter = new DefaultGoogleRateLimiter(12);

  private isGoogleQuotaError(err: unknown): boolean {
    const msg = (err as Error)?.message ?? '';
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
  }

  /**
   * 요청된 모델을 실제로 사용 가능한 모델로 확정합니다.
   * - 빈 문자열: 사용자 기본값 또는 시스템 기본 AI(Gemini)로 폴백
   * - 로컬 모델(ollama/llama): 그대로 반환
   * - 명시적 클라우드 모델: 해당 프로바이더 키가 없으면 **명확한 오류** (조용한 폴백 제거)
   */
  resolveEffectiveModel(requestedModel: string): string {

    // 모델이 없으면 기본값 반환
    if (!requestedModel) {
      const store = requestContext.getStore();
      return store?.defaultCloudModel || DEFAULT_AI_MODEL();
    }

    // 로컬 모델은 즉시 반한
    if (
      requestedModel.startsWith(AI_MODEL_PREFIX.OLLAMA) ||
      requestedModel.startsWith(AI_MODEL_PREFIX.LLAMA_CPP)
    ) {
      return requestedModel;
    }

    const store = requestContext.getStore();
    const keys = store?.apiKeys;
    const provider = getProvider(requestedModel);

    switch (provider) {
      case AIProvider.ANTHROPIC:
        if (!keys?.anthropicApiKey) {
          throw new UndefinedAiAPIException(
            `Anthropic API 키가 설정되지 않아 "${requestedModel}" 모델을 사용할 수 없습니다. ` +
            `[설정 → Overview]에서 본인의 Anthropic 키를 입력하거나, 무료 Gemini 모델을 선택하세요.`
          );
        }
        break;

      case AIProvider.OPENAI:
        if (!keys?.openaiApiKey) {
          throw new UndefinedAiAPIException(
            `OpenAI API 키가 설정되지 않아 "${requestedModel}" 모델을 사용할 수 없습니다. ` +
            `[설정 → Overview]에서 본인의 OpenAI 키를 입력하거나, 무료 Gemini 모델을 선택하세요.`
          );
        }
        break;

      case AIProvider.GOOGLE:
        if (!keys?.googleApiKey && !DEFAULT_GOOGLE_API_KEY()) {
          throw new UndefinedAiAPIException('Google API 키가 설정되지 않았습니다. [설정 → Overview]에서 키를 입력해주세요.');
        }
        break;
    }

    return requestedModel;
  }

  private getAnthropicClient(): Anthropic {
    const key = requestContext.getStore()?.apiKeys.anthropicApiKey;
    if (key) return new Anthropic({ apiKey: key });
    // 사용자 키 없음 — resolveEffectiveModel 이 이미 Gemini 로 전환했어야 하지만 안전망
    throw new UndefinedAiAPIException('Anthropic API 키가 설정되지 않았습니다. Overview 설정에서 키를 입력해주세요.');
  }

  private getOpenAIClient(): OpenAI {
    const key = requestContext.getStore()?.apiKeys.openaiApiKey;
    if (key) return new OpenAI({ apiKey: key });
    throw new UndefinedAiAPIException('OpenAI API 키가 설정되지 않았습니다. Overview 설정에서 키를 입력해주세요.');
  }

  private isUsingDefaultGoogleKey(): boolean {
    return !requestContext.getStore()?.apiKeys.googleApiKey;
  }

  private getGoogleClient(): GoogleGenAI {
    const key = requestContext.getStore()?.apiKeys.googleApiKey;
    if (key) return new GoogleGenAI({ apiKey: key });
    return this.defaultGoogle;
  }

  constructor(
    private readonly tokenHistoryRepository: TokenHistoryRepository,
    private readonly aiCallLogRepository: AiCallLogRepository,
  ) { }

  async call(
    aiModel: string,
    system: string,
    prompt: string | any[],
    opts?: { useBuiltinSearch?: boolean; tools?: any[]; signal?: AbortSignal; caller?: string },
  ): Promise<{ text: string; inputTokens: number; outputTokens: number; estimatedFees: number; toolCalls?: ToolCallResult[]; stopReason?: string; searchLog?: { query: string; result: string }[] }> {

    aiModel = this.resolveEffectiveModel(aiModel);
    const promptPreview = typeof prompt === 'string'
      ? prompt
      : prompt.map((m: any) => {
        const content = typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content);
        return `[${m.role}] ${content}`;
      }).join('\n');
    this.logger.log(
      `model=${aiModel}\n` +
      `[system]\n${system}\n[/system]\n` +
      `[prompt]\n${promptPreview}\n[/prompt]`,
    );
    const useSearch = opts?.useBuiltinSearch ?? false;
    const promptText = typeof prompt === 'string'
      ? prompt
      : prompt.map((m: any) => (typeof m.content === 'string' ? m.content : '')).filter(Boolean).join('\n');
    const messages = typeof prompt === 'string' ? [{ role: 'user' as const, content: prompt }] : prompt;

    const signal = opts?.signal;
    const caller = opts?.caller ?? null;
    const startMs = Date.now();
    const logId = randomUUID();

    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedFees = 0;
    let text = '';
    let toolCalls: ToolCallResult[] | undefined;
    let stopReason: string | undefined;
    let searchLog: { query: string; result: string }[] | undefined;
    let errorMsg: string | undefined;

    try {
      // Ollama
      if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
        const ollamaModel = aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length);
        try {
          if (opts?.tools?.length) {
            const result = await callOllama(ollamaModel, system, messages, undefined, undefined, opts.tools as OllamaTool[], undefined, signal);
            toolCalls = result.toolCalls.map((tc) => ({
              id: randomUUID(),
              name: tc.function.name,
              input: tc.function.arguments as Record<string, unknown>,
            }));
            text = result.content;
            stopReason = toolCalls.length ? 'tool_use' : 'end_turn';
          } else {
            text = await callOllama(ollamaModel, system, promptText, undefined, undefined, undefined, undefined, signal) as string;
          }
        } catch (err) {
          if (err instanceof OllamaInsufficientMemoryError) {
            this.logger.error(`[메모리 부족] model=${ollamaModel} | ${err.message}`);
          } else {
            this.logger.error(`[Ollama 호출 오류] model=${ollamaModel} | ${(err as Error).message}`);
          }
          throw err;
        }
        return { text, inputTokens: 0, outputTokens: 0, estimatedFees: 0, toolCalls, stopReason };
      }

      // Cloud + llama.cpp providers
      const provider = getProvider(aiModel);
      if (provider === AIProvider.ANTHROPIC) {
        const result = await callAnthropic(this.getAnthropicClient(), aiModel, system, messages as Anthropic.MessageParam[], useSearch, opts?.tools as Anthropic.Tool[] | undefined, signal);
        ({ text, inputTokens, outputTokens, toolCalls, stopReason, searchLog } = result);
      } else if (provider === AIProvider.GOOGLE) {
        if (this.isUsingDefaultGoogleKey()) await this.defaultGoogleLimiter.wait();
        try {
          const result = await callGoogle(this.getGoogleClient(), aiModel, system + '\n\n' + promptText, useSearch);
          ({ text, inputTokens, outputTokens } = result);
        } catch (googleErr) {
          if (this.isUsingDefaultGoogleKey() && this.isGoogleQuotaError(googleErr) && DEFAULT_GROQ_API_KEY()) {
            this.logger.warn(`[Gemini quota] Groq 폴백 model=${DEFAULT_GROQ_MODEL()}`);
            const result = await callGroq(DEFAULT_GROQ_API_KEY(), DEFAULT_GROQ_MODEL(), system, messages as OpenAI.ChatCompletionMessageParam[], undefined, signal);
            ({ text, inputTokens, outputTokens, toolCalls, stopReason } = result);
          } else {
            throw googleErr;
          }
        }
      } else if (provider === AIProvider.LLAMA_CPP) {
        const llamaModel = aiModel.slice(AI_MODEL_PREFIX.LLAMA_CPP.length);
        const result = await callOpenAI(getLlamaCppClient(), llamaModel, system, messages as OpenAI.ChatCompletionMessageParam[], opts?.tools as OpenAI.ChatCompletionTool[] | undefined, signal);
        ({ text, inputTokens, outputTokens, toolCalls, stopReason } = result);
      } else {
        const result = await callOpenAI(this.getOpenAIClient(), aiModel, system, messages as OpenAI.ChatCompletionMessageParam[], opts?.tools as OpenAI.ChatCompletionTool[] | undefined, signal);
        ({ text, inputTokens, outputTokens, toolCalls, stopReason } = result);
      }

      const modelInfo = MODELS.find((m) => aiModel.startsWith(m.id));
      estimatedFees = modelInfo
        ? (inputTokens / 1_000_000) * modelInfo.inputPricePer1M +
        (outputTokens / 1_000_000) * modelInfo.outputPricePer1M
        : 0;

      this.tokenHistoryRepository
        .save({ id: randomUUID(), aiModel, usedTokens: `input:${inputTokens}/output:${outputTokens}`, estimatedFees })
        .catch(() => { });

      return { text, inputTokens, outputTokens, estimatedFees, toolCalls, stopReason, searchLog };
    } catch (err) {
      errorMsg = (err as Error).message;
      this.logger.error(`model=${aiModel} | ERROR ${errorMsg}`);
      throw err;
    } finally {
      this.aiCallLogRepository.save({
        id: logId, aiModel, caller,
        userId: requestContext.getStore()?.id ?? null,
        systemPrompt: system.slice(0, 2000),
        userPrompt: promptText.slice(0, 2000),
        response: text ? text.slice(0, 2000) : null,
        error: errorMsg ?? null,
        inputTokens, outputTokens, estimatedFees,
        durationMs: Date.now() - startMs,
      }).catch(() => { });
    }
  }

  async *stream(
    aiModel: string,
    system: string,
    messages: import('./provider/vlm.types').VlmMessage[],
  ): AsyncGenerator<string> {
    aiModel = this.resolveEffectiveModel(aiModel);

    const streamPreview = messages.map((m) => {
      const text = typeof m.content === 'string'
        ? m.content
        : m.content.filter((c): c is string => typeof c === 'string').join(' ');
      return `[${m.role}] ${text}`;
    }).join('\n');
    this.logger.log(`model=${aiModel} | system=\n${system}\n[/system]\nstream=\n${streamPreview}\n[/stream]`);

    // **** 로컬 **** //
    if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      const ollamaModel = aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length);
      try {
        yield* streamOllama(ollamaModel, system, messages);
      } catch (err) {
        if (err instanceof OllamaInsufficientMemoryError) {
          this.logger.error(`[메모리 부족] model=${ollamaModel} | ${err.message}`);
        } else {
          this.logger.error(`[Ollama 스트림 오류] model=${ollamaModel} | ${(err as Error).message}`);
        }
        throw err;
      }
      return;
    }

    const provider = getProvider(aiModel);

    // **** 클라우드 **** //
    try {
      if (provider === AIProvider.ANTHROPIC) {
        yield* streamAnthropic(this.getAnthropicClient(), aiModel, system, messages);

      } else if (provider === AIProvider.GOOGLE) {
        if (this.isUsingDefaultGoogleKey()) await this.defaultGoogleLimiter.wait();
        try {
          yield* streamGoogle(this.getGoogleClient(), aiModel, system, messages);
        } catch (googleErr) {
          if (this.isUsingDefaultGoogleKey() && this.isGoogleQuotaError(googleErr) && DEFAULT_GROQ_API_KEY()) {
            this.logger.warn(`[Gemini quota] Groq 스트림 폴백 model=${DEFAULT_GROQ_MODEL()}`);
            yield* streamGroq(DEFAULT_GROQ_API_KEY(), DEFAULT_GROQ_MODEL(), system, messages);
          } else {
            throw googleErr;
          }
        }

      } else if (provider === AIProvider.LLAMA_CPP) {
        const llamaModel = aiModel.slice(AI_MODEL_PREFIX.LLAMA_CPP.length);
        yield* streamOpenAI(getLlamaCppClient(), llamaModel, system, messages);

      } else if (provider === AIProvider.OPENAI) {
        yield* streamOpenAI(this.getOpenAIClient(), aiModel, system, messages);

      } else {
        throw new InvalidAiTypeException(aiModel);
      }
    } catch (err) {
      this.logger.error(`model=${aiModel} | STREAM ERROR ${(err as Error).message}`);
      throw err;
    }
  }

  async getLocalAiModels() {
    const models: (typeof MODELS[number] & { provider: string })[] = [...MODELS];
    for (const m of await getOllamaLocalModels()) {
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
    for (const m of await getLlamaCppModels()) {
      models.push({
        id: `llama:${m.name}`,
        name: m.name,
        provider: 'llama-cpp',
        description: '로컬 llama.cpp 모델',
        inputPricePer1M: 0,
        outputPricePer1M: 0,
        contextWindow: 8192,
        webSearch: false,
      });
    }
    return models;
  }

  async getLlamaCppModels(): Promise<{ name: string }[]> {
    return getLlamaCppModels();
  }

  async getRunningOllamaModels(): Promise<{ name: string; size: number; size_vram: number }[]> {
    return getOllamaRunningModels();
  }

  async unloadOllamaModel(model: string): Promise<void> {
    return unloadOllamaModel(model);
  }

  /** 모델별 입력 토큰 단가 ($/1M tokens). null = 알 수 없음/로컬 */
  getInputCostPer1M(model: string): number | null {
    if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) return null;
    const found = MODELS.find((m) => model.startsWith(m.id));
    return found?.inputPricePer1M ?? null;
  }
}
