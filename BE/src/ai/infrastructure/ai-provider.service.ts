import { Injectable, Logger } from '@nestjs/common';
export type {
  VlmMessage,
  ImageContentBlock,
  VlmContent,
} from 'src/ai/application/ai-provider.types';
import type {
  AiCallResult,
  AiProviderCallRequest,
  AiProviderStreamRequest,
  ToolCallResult,
  VlmMessage,
} from 'src/ai/application/ai-provider.types';
import { AiModelProviderPort } from 'src/ai/application/ports/ai-model-provider.port';
import { AiProviderRegistry } from 'src/ai/infrastructure/provider/ai-provider.registry';
import {
  MODELS,
  AI_MODEL_PREFIX,
  getProvider,
  AIProvider,
} from 'src/ai/domain/models';
import { TokenHistoryRepository } from 'src/overview/domain/repository/token-history.repository';
import { AiCallLogRepository } from 'src/ai/domain/repository/ai-call-log.repository';
import {
  requestContext,
  DEFAULT_AI_MODEL,
  DEFAULT_GROQ_MODEL,
} from 'src/shared/request-context';
import { randomUUID } from 'crypto';

const MAX_AI_PROVIDER_INPUT_TOKENS = 1_000_000;

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

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

    const provider = getProvider(requestedModel);
    this.providerRegistry.get(provider).assertConfigured(requestedModel);

    return requestedModel;
  }

  constructor(
    private readonly tokenHistoryRepository: TokenHistoryRepository,
    private readonly aiCallLogRepository: AiCallLogRepository,
    private readonly providerRegistry: AiProviderRegistry,
  ) {}

  async call(
    aiModel: string,
    system: string,
    prompt: string | unknown[],
    opts?: {
      useBuiltinSearch?: boolean;
      tools?: unknown[];
      signal?: AbortSignal;
      caller?: string;
    },
  ): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
    toolCalls?: ToolCallResult[];
    stopReason?: string;
    searchLog?: { query: string; result: string }[];
  }> {
    aiModel = this.resolveEffectiveModel(aiModel);
    const promptPreview =
      typeof prompt === 'string'
        ? prompt
        : prompt
            .map((message) => {
              const content = this.getMessageContent(message);
              const preview =
                typeof content === 'string' ? content : JSON.stringify(content);
              return `[${this.getMessageRole(message)}] ${preview}`;
            })
            .join('\n');
    this.logger.log(
      `model=${aiModel}\n` +
        `[system]\n${system}\n[/system]\n` +
        `[prompt]\n${promptPreview}\n[/prompt]`,
    );
    const useSearch = opts?.useBuiltinSearch ?? false;
    const promptText =
      typeof prompt === 'string'
        ? prompt
        : prompt
            .map((message) => {
              const content = this.getMessageContent(message);
              return typeof content === 'string' ? content : '';
            })
            .filter(Boolean)
            .join('\n');
    const messages =
      typeof prompt === 'string'
        ? [{ role: 'user' as const, content: prompt }]
        : prompt;
    this.assertInputTokenBudget(
      system,
      promptText,
      opts?.caller ?? 'AiProvider/call',
    );

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
      const providerType = getProvider(aiModel);
      const provider = this.providerRegistry.get(providerType);
      const request = {
        model: aiModel,
        system,
        promptText,
        messages,
        useBuiltinSearch: useSearch,
        tools: opts?.tools,
        signal,
      };

      const result =
        providerType === AIProvider.GOOGLE
          ? await this.callGoogleWithFallback(provider, request)
          : await provider.call(request);
      ({ text, inputTokens, outputTokens, toolCalls, stopReason, searchLog } =
        result);

      if (providerType === AIProvider.OLLAMA) {
        return {
          text,
          inputTokens,
          outputTokens,
          estimatedFees: 0,
          toolCalls,
          stopReason,
          searchLog,
        };
      }

      const modelInfo = MODELS.find((m) => aiModel.startsWith(m.id));
      estimatedFees = modelInfo
        ? (inputTokens / 1_000_000) * modelInfo.inputPricePer1M +
          (outputTokens / 1_000_000) * modelInfo.outputPricePer1M
        : 0;

      this.tokenHistoryRepository
        .save({
          id: randomUUID(),
          aiModel,
          usedTokens: `input:${inputTokens}/output:${outputTokens}`,
          estimatedFees,
        })
        .catch(() => {});

      return {
        text,
        inputTokens,
        outputTokens,
        estimatedFees,
        toolCalls,
        stopReason,
        searchLog,
      };
    } catch (err) {
      errorMsg = (err as Error).message;
      this.logger.error(`model=${aiModel} | ERROR ${errorMsg}`);
      throw err;
    } finally {
      this.aiCallLogRepository
        .save({
          id: logId,
          aiModel,
          caller,
          userId: requestContext.getStore()?.id ?? null,
          systemPrompt: system.slice(0, 2000),
          userPrompt: promptText.slice(0, 2000),
          response: text ? text.slice(0, 2000) : null,
          error: errorMsg ?? null,
          inputTokens,
          outputTokens,
          estimatedFees,
          durationMs: Date.now() - startMs,
        })
        .catch(() => {});
    }
  }

  private async callGoogleWithFallback(
    google: AiModelProviderPort,
    request: AiProviderCallRequest,
  ): Promise<AiCallResult> {
    try {
      return await google.call(request);
    } catch (googleError) {
      const groq = this.providerRegistry.get(AIProvider.GROQ);
      if (
        !google.isUsingDefaultCredential() ||
        !google.isRateLimitError(googleError) ||
        !groq.isConfigured('default')
      ) {
        throw googleError;
      }

      this.logger.warn(
        `[Gemini quota] Groq 폴백 model=${DEFAULT_GROQ_MODEL()}`,
      );
      try {
        return await groq.call({
          ...request,
          model: DEFAULT_GROQ_MODEL(),
          useBuiltinSearch: false,
          tools: undefined,
          credentialMode: 'default',
        });
      } catch (groqError) {
        const anthropic = this.providerRegistry.get(AIProvider.ANTHROPIC);
        if (
          !groq.isRateLimitError(groqError) ||
          !anthropic.isConfigured('default')
        ) {
          throw groqError;
        }

        const fallbackModel = 'claude-haiku-4-5-20251001';
        this.logger.warn(`[Groq quota] Claude 폴백 model=${fallbackModel}`);
        return anthropic.call({
          ...request,
          model: fallbackModel,
          useBuiltinSearch: false,
          tools: undefined,
          credentialMode: 'default',
        });
      }
    }
  }

  async *stream(
    aiModel: string,
    system: string,
    messages: VlmMessage[],
  ): AsyncGenerator<string> {
    aiModel = this.resolveEffectiveModel(aiModel);

    const streamPreview = messages
      .map((m) => {
        const text =
          typeof m.content === 'string'
            ? m.content
            : m.content
                .filter((c): c is string => typeof c === 'string')
                .join(' ');
        return `[${m.role}] ${text}`;
      })
      .join('\n');
    this.assertInputTokenBudget(system, streamPreview, 'AiProvider/stream');
    this.logger.log(
      `model=${aiModel} | system=\n${system}\n[/system]\nstream=\n${streamPreview}\n[/stream]`,
    );

    const providerType = getProvider(aiModel);
    const provider = this.providerRegistry.get(providerType);
    const request = { model: aiModel, system, messages };
    try {
      if (providerType === AIProvider.GOOGLE) {
        yield* this.streamGoogleWithFallback(provider, request);
      } else {
        yield* provider.stream(request);
      }
    } catch (err) {
      this.logger.error(
        `model=${aiModel} | STREAM ERROR ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private async *streamGoogleWithFallback(
    google: AiModelProviderPort,
    request: AiProviderStreamRequest,
  ): AsyncGenerator<string> {
    try {
      yield* google.stream(request);
      return;
    } catch (googleError) {
      const hasImages = request.messages.some(
        (message) =>
          Array.isArray(message.content) &&
          message.content.some(
            (content) =>
              typeof content === 'object' &&
              content !== null &&
              content.type === 'image',
          ),
      );
      const groq = this.providerRegistry.get(AIProvider.GROQ);
      if (
        hasImages ||
        !google.isUsingDefaultCredential() ||
        !google.isRateLimitError(googleError) ||
        !groq.isConfigured('default')
      ) {
        throw googleError;
      }

      this.logger.warn(
        `[Gemini quota] Groq 스트림 폴백 model=${DEFAULT_GROQ_MODEL()}`,
      );
      try {
        yield* groq.stream({
          ...request,
          model: DEFAULT_GROQ_MODEL(),
          credentialMode: 'default',
        });
      } catch (groqError) {
        const anthropic = this.providerRegistry.get(AIProvider.ANTHROPIC);
        if (
          !groq.isRateLimitError(groqError) ||
          !anthropic.isConfigured('default')
        ) {
          throw groqError;
        }

        const fallbackModel = 'claude-haiku-4-5-20251001';
        this.logger.warn(
          `[Groq quota] Claude 스트림 폴백 model=${fallbackModel}`,
        );
        yield* anthropic.stream({
          ...request,
          model: fallbackModel,
          credentialMode: 'default',
        });
      }
    }
  }

  async getLocalAiModels() {
    const models: ((typeof MODELS)[number] & { provider: string })[] = [
      ...MODELS,
    ];
    const ollama = this.providerRegistry.get(AIProvider.OLLAMA);
    const llamaCpp = this.providerRegistry.get(AIProvider.LLAMA_CPP);
    for (const m of await ollama.listModels()) {
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
    for (const m of await llamaCpp.listModels()) {
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
    return this.providerRegistry.get(AIProvider.LLAMA_CPP).listModels();
  }

  async getRunningOllamaModels(): Promise<
    { name: string; size: number; size_vram: number }[]
  > {
    return this.providerRegistry.get(AIProvider.OLLAMA).getRunningModels();
  }

  async unloadOllamaModel(model: string): Promise<void> {
    return this.providerRegistry.get(AIProvider.OLLAMA).unloadModel(model);
  }

  /** 모델별 입력 토큰 단가 ($/1M tokens). null = 알 수 없음/로컬 */
  getInputCostPer1M(model: string): number | null {
    if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) return null;
    const found = MODELS.find((m) => model.startsWith(m.id));
    return found?.inputPricePer1M ?? null;
  }

  private assertInputTokenBudget(
    system: string,
    promptText: string,
    caller: string,
  ): void {
    const estimatedTokens = this.estimateInputTokens(
      `${system}\n${promptText}`,
    );
    if (estimatedTokens < MAX_AI_PROVIDER_INPUT_TOKENS) return;

    throw new Error(
      `AI 입력이 너무 큽니다. caller=${caller}, estimatedInputTokens=${estimatedTokens.toLocaleString()}, ` +
        `limit=${MAX_AI_PROVIDER_INPUT_TOKENS.toLocaleString()}. 요청 데이터를 줄여주세요.`,
    );
  }

  private getMessageRole(message: unknown): string {
    if (
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      typeof message.role === 'string'
    ) {
      return message.role;
    }
    return 'unknown';
  }

  private getMessageContent(message: unknown): unknown {
    if (
      typeof message === 'object' &&
      message !== null &&
      'content' in message
    ) {
      return message.content;
    }
    return '';
  }

  private estimateInputTokens(text: string): number {
    let cjk = 0;
    let ascii = 0;
    let other = 0;

    for (const char of text) {
      if (/\s/.test(char)) continue;
      if (/[\u3131-\u318E\uAC00-\uD7A3\u3040-\u30FF\u3400-\u9FFF]/.test(char))
        cjk++;
      else if (char.charCodeAt(0) < 128) ascii++;
      else other++;
    }

    return Math.ceil(cjk + other * 0.8 + ascii / 4);
  }
}
