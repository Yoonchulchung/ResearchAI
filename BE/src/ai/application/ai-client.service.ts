import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { callAnthropic } from '../infrastructure/anthropic.ai';
import { callOpenAI } from '../infrastructure/openai.ai';
import { callGoogle } from '../infrastructure/google.ai';
import { callOllama } from '../infrastructure/ollama.ai';
import { MODELS } from '../domain/models';

@Injectable()
export class AiClientService {
  readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  readonly google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  async call(
    model: string,
    system: string,
    prompt: string,
    opts?: { useBuiltinSearch?: boolean },
  ): Promise<string> {
    const useSearch = opts?.useBuiltinSearch ?? false;
    if (model.startsWith('claude')) {
      return callAnthropic(this.anthropic, model, system, prompt, useSearch);
    } else if (model.startsWith('gemini')) {
      return callGoogle(this.google, model, system + '\n\n' + prompt, useSearch);
    } else if (model.startsWith('ollama:')) {
      return callOllama(model.slice('ollama:'.length), system, prompt);
    } else {
      return callOpenAI(this.openai, model, system, prompt);
    }
  }

  /** 모델별 입력 토큰 단가 ($/1M tokens). null = 알 수 없음/로컬 */
  getInputCostPer1M(model: string): number | null {
    if (model.startsWith('ollama:')) return null;
    const found = MODELS.find((m) => model.startsWith(m.id));
    return found?.inputPricePer1M ?? null;
  }
}
