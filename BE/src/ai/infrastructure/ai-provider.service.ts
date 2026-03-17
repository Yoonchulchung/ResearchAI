import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type { ToolCallResult } from './provider/anthropic.ai';
import { callAnthropic, streamAnthropic } from './provider/anthropic.ai';
import { callOpenAI, streamOpenAI } from './provider/openai.ai';
import { callGoogle, streamGoogle } from './provider/google.ai';
import { callOllama, streamOllama, getOllamaLocalModels, getOllamaRunningModels, unloadOllamaModel, OllamaTool } from './provider/ollama.ai';
import { MODELS, AI_MODEL_PREFIX, getProvider, AIProvider } from '../domain/models';
import { InvalidAiTypeException } from '../../shared/exceptions/invalid-ai-type.exception';
import { TokenHistoryRepository } from '../../overview/domain/repository/token-history.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class AiProviderService {
  readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private readonly google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(private readonly tokenHistoryRepository: TokenHistoryRepository) {}

  async call(
    aiModel: string,
    system: string,
    prompt: string | any[],
    opts?: { useBuiltinSearch?: boolean; tools?: any[] },
  ): Promise<{ text: string; inputTokens: number; outputTokens: number; estimatedFees: number; toolCalls?: ToolCallResult[]; stopReason?: string }> {
    const useSearch = opts?.useBuiltinSearch ?? false;
    const promptText = typeof prompt === 'string'
      ? prompt
      : prompt.map((m: any) => (typeof m.content === 'string' ? m.content : '')).filter(Boolean).join('\n');
    const messages = typeof prompt === 'string' ? [{ role: 'user' as const, content: prompt }] : prompt;

    if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      const ollamaModel = aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length);
      if (opts?.tools?.length) {
        const result = await callOllama(ollamaModel, system, messages, undefined, undefined, opts.tools as OllamaTool[]);
        const toolCalls = result.toolCalls.map((tc) => ({
          id: randomUUID(),
          name: tc.function.name,
          input: tc.function.arguments as Record<string, unknown>,
        }));
        return {
          text: result.content,
          inputTokens: 0, outputTokens: 0, estimatedFees: 0,
          toolCalls: toolCalls.length ? toolCalls : undefined,
          stopReason: toolCalls.length ? 'tool_use' : 'end_turn',
        };
      }
      const text = await callOllama(ollamaModel, system, promptText);
      return { text, inputTokens: 0, outputTokens: 0, estimatedFees: 0 };
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let text = '';
    let toolCalls: ToolCallResult[] | undefined;
    let stopReason: string | undefined;

    const provider = getProvider(aiModel);
    if (provider === AIProvider.ANTHROPIC) {
      const result = await callAnthropic(this.anthropic, aiModel, system, messages as Anthropic.MessageParam[], useSearch, opts?.tools as Anthropic.Tool[] | undefined);
      ({ text, inputTokens, outputTokens, toolCalls, stopReason } = result);
    } else if (provider === AIProvider.GOOGLE) {
      const result = await callGoogle(this.google, aiModel, system + '\n\n' + promptText, useSearch);
      ({ text, inputTokens, outputTokens } = result);
    } else {
      const result = await callOpenAI(this.openai, aiModel, system, messages as OpenAI.ChatCompletionMessageParam[], opts?.tools as OpenAI.ChatCompletionTool[] | undefined);
      ({ text, inputTokens, outputTokens, toolCalls, stopReason } = result);
    }

    const modelInfo = MODELS.find((m) => aiModel.startsWith(m.id));
    const estimatedFees = modelInfo
      ? (inputTokens / 1_000_000) * modelInfo.inputPricePer1M +
        (outputTokens / 1_000_000) * modelInfo.outputPricePer1M
      : 0;

    this.tokenHistoryRepository
      .save({ id: randomUUID(), aiModel, usedTokens: `input:${inputTokens}/output:${outputTokens}`, estimatedFees })
      .catch(() => {});

    return { text, inputTokens, outputTokens, estimatedFees, toolCalls, stopReason };
  }

  async *stream(
    aiModel: string,
    system: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string> {
    
    // **** 로컬 **** //
    if (aiModel.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      const ollamaModel = aiModel.slice(AI_MODEL_PREFIX.OLLAMA.length);
      yield* streamOllama(ollamaModel, system, messages);
      return;
    }

    const provider = getProvider(aiModel);

    // **** 클라우드 **** //
    if (provider === AIProvider.ANTHROPIC) {
      yield* streamAnthropic(this.anthropic, aiModel, system, messages);

    } else if (provider === AIProvider.GOOGLE) {
      yield* streamGoogle(this.google, aiModel, system, messages);

    } else if (provider === AIProvider.OPENAI) {
      yield* streamOpenAI(this.openai, aiModel, system, messages);
      
    } else {
      throw new InvalidAiTypeException(aiModel);
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
    return models;
  }

  async getRunningOllamaModels(): Promise<{ name: string; size_vram: number }[]> {
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
