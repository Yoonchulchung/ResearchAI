import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { callAnthropic } from '../infrastructure/anthropic.ai';
import { callOpenAI } from '../infrastructure/openai.ai';
import { callGoogle } from '../infrastructure/google.ai';
import { callOllama } from '../infrastructure/ollama.ai';

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
    const pricing: Record<string, number> = {
      // Anthropic
      'claude-haiku-4-5':  0.80,
      'claude-haiku-3-5':  0.80,
      'claude-sonnet-4-5': 3.00,
      'claude-sonnet-4-6': 3.00,
      'claude-3-5-sonnet': 3.00,
      'claude-opus-4':    15.00,
      'claude-opus-4-6':  15.00,
      'claude-3-opus':    15.00,
      // OpenAI
      'gpt-4o':            2.50,
      'gpt-4o-mini':       0.15,
      'gpt-4-turbo':      10.00,
      'gpt-3.5-turbo':     0.50,
      'o1':               15.00,
      'o1-mini':           1.10,
      // Google
      'gemini-2.0-flash':  0.10,
      'gemini-1.5-flash':  0.075,
      'gemini-1.5-pro':    1.25,
    };
    const exact = pricing[model];
    if (exact != null) return exact;
    for (const [key, price] of Object.entries(pricing)) {
      if (model.startsWith(key)) return price;
    }
    return null;
  }
}
