import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { callAnthropic } from '../infrastructure/anthropic.ai';
import { callOpenAI } from '../infrastructure/openai.ai';
import { callGoogle } from '../infrastructure/google.ai';
import { callOllama } from '../infrastructure/ollama.ai';
import { MODELS, AI_MODEL_PREFIX, getProvider, AIProvider } from '../domain/models';
import { TokenHistoryRepository } from '../../overview/domain/repository/token-history.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class AiClientService {
  readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  readonly google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(private readonly tokenHistoryRepository: TokenHistoryRepository) {}

  async call(
    model: string,
    system: string,
    prompt: string,
    opts?: { useBuiltinSearch?: boolean },
  ): Promise<string> {
    const useSearch = opts?.useBuiltinSearch ?? false;

    if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) {
      return callOllama(model.slice(AI_MODEL_PREFIX.OLLAMA.length), system, prompt);
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let text = '';

    const provider = getProvider(model);
    if (provider === AIProvider.ANTHROPIC) {
      const result = await callAnthropic(this.anthropic, model, system, prompt, useSearch);
      ({ text, inputTokens, outputTokens } = result);
    } else if (provider === AIProvider.GOOGLE) {
      const result = await callGoogle(this.google, model, system + '\n\n' + prompt, useSearch);
      ({ text, inputTokens, outputTokens } = result);
    } else {
      const result = await callOpenAI(this.openai, model, system, prompt);
      ({ text, inputTokens, outputTokens } = result);
    }

    const modelInfo = MODELS.find((m) => model.startsWith(m.id));
    const estimatedFees = modelInfo
      ? (inputTokens / 1_000_000) * modelInfo.inputPricePer1M +
        (outputTokens / 1_000_000) * modelInfo.outputPricePer1M
      : 0;

    this.tokenHistoryRepository
      .save({
        id: randomUUID(),
        aiModel: model,
        usedTokens: `input:${inputTokens}/output:${outputTokens}`,
        estimatedFees,
      })
      .catch(() => {});

    return text;
  }

  /** 모델별 입력 토큰 단가 ($/1M tokens). null = 알 수 없음/로컬 */
  getInputCostPer1M(model: string): number | null {
    if (model.startsWith(AI_MODEL_PREFIX.OLLAMA)) return null;
    const found = MODELS.find((m) => model.startsWith(m.id));
    return found?.inputPricePer1M ?? null;
  }
}
