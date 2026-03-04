import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { PROMPTS } from '../../domain/prompt/research.prompts';
import { searchTavily } from '../../infrastructure/search/tavily.search';
import { callAnthropic } from '../../infrastructure/ai/anthropic.ai';
import { callOpenAI } from '../../infrastructure/ai/openai.ai';
import { callGoogle } from '../../infrastructure/ai/google.ai';
import { callOllama } from '../../infrastructure/ai/ollama.ai';

/**
 * LightResearch 2단계 파이프라인
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Step 1. Tavily 검색 (선택적, API 키 설정 시)               │
 * │          → 주제 관련 최신 정보 수집                          │
 * ├─────────────────────────────────────────────────────────┤
 * │  Step 2. AI 태스크 목록 생성 (Claude 등)                     │
 * │          → 검색 결과 기반 조사 항목 5~7개 생성                  │
 * └─────────────────────────────────────────────────────────┘
 */
@Injectable()
export class LightResearchPipelineService {
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  async run(topic: string, model: string): Promise<{ tasks: any[] }> {
    const { tasks } = await this.generate(topic, model);
    return { tasks };
  }

  /** 파이프라인 테스트용 — fullPrompt, searchContext 포함 반환 */
  async testRun(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string },
  ) {
    return this.generate(topic, model, opts);
  }

  private async generate(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string },
  ) {
    // ── Step 1: Tavily 검색 (선택적) ──
    let searchContext: string | undefined;
    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      try {
        searchContext = await searchTavily(topic);
      } catch {
        // 검색 실패 시 컨텍스트 없이 진행
      }
    }

    // ── Step 2: AI 태스크 목록 생성 ──
    const fullPrompt = opts?.customPrompt
      ? opts.customPrompt
          .replaceAll('{{topic}}', topic)
          .replaceAll('{{searchContext}}', searchContext ?? '')
      : PROMPTS.generateTasks(topic, searchContext);

    const raw = await this.callAI(model, fullPrompt, opts?.customSystem);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);

    return { tasks, searchContext, fullPrompt };
  }

  private async callAI(model: string, prompt: string, systemOverride?: string): Promise<string> {
    const system = systemOverride ?? PROMPTS.system;

    if (model.startsWith('claude')) {
      return callAnthropic(this.anthropic, model, system, prompt, false);
    } else if (model.startsWith('gemini')) {
      return callGoogle(this.google, model, system + '\n\n' + prompt, false);
    } else if (model.startsWith('ollama:')) {
      return callOllama(model.slice('ollama:'.length), system, prompt);
    } else {
      return callOpenAI(this.openai, model, system, prompt);
    }
  }
}
