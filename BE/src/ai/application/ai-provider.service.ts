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

  /** 모델별 입력 토큰 단가 ($/1M tokens). null = 알 수 없음/로컬 */
  getInputCostPer1M(model: string): number | null {
    if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) return null;
    const found = MODELS.find((m) => model.startsWith(m.id));
    return found?.inputPricePer1M ?? null;
  }
}
