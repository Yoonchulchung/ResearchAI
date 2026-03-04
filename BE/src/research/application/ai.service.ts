import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { PROMPTS } from '../domain/prompt/research.prompts';
import { searchTavily } from '../infrastructure/search/tavily.search';
import { callAnthropic } from '../infrastructure/ai/anthropic.ai';
import { callOpenAI } from '../infrastructure/ai/openai.ai';
import { callGoogle } from '../infrastructure/ai/google.ai';
import { callOllama } from '../infrastructure/ai/ollama.ai';
import { SearchService } from './search.service';

@Injectable()
export class AiService {
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(private readonly searchService: SearchService) {}

  async runResearch(prompt: string, model: string, context = '') {
    const useBuiltinSearch = !this.searchService.hasExternalSearch() && !context;
    const result = await this.callAI(model, prompt, useBuiltinSearch, context);
    return { result };
  }

  async generateTasks(topic: string, model: string) {
    const { tasks } = await this.testGenerateTasks(topic, model);
    return { tasks };
  }

  async testGenerateTasks(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string },
  ) {
    let searchContext: string | undefined;
    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      try {
        searchContext = await searchTavily(topic);
      } catch {
        // 검색 실패 시 컨텍스트 없이 진행
      }
    }

    const fullPrompt = opts?.customPrompt
      ? opts.customPrompt
          .replaceAll('{{topic}}', topic)
          .replaceAll('{{searchContext}}', searchContext ?? '')
      : PROMPTS.generateTasks(topic, searchContext);

    const raw = await this.callAI(model, fullPrompt, false, '', opts?.customSystem);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);
    return { tasks, searchContext, fullPrompt };
  }

  private async callAI(
    model: string,
    prompt: string,
    useBuiltinSearch: boolean,
    context = '',
    systemOverride?: string,
  ): Promise<string> {
    const system = systemOverride ?? PROMPTS.system;
    const fullPrompt = context ? PROMPTS.withSearchContext(context, prompt) : prompt;

    if (model.startsWith('claude')) {
      return callAnthropic(this.anthropic, model, system, fullPrompt, useBuiltinSearch);
    } else if (model.startsWith('gemini')) {
      return callGoogle(this.google, model, system + '\n\n' + fullPrompt, useBuiltinSearch);
    } else if (model.startsWith('ollama:')) {
      return callOllama(model.slice('ollama:'.length), system, fullPrompt);
    } else {
      return callOpenAI(this.openai, model, system, fullPrompt);
    }
  }
}
