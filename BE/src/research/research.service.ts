import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { tavily } from '@tavily/core';
import { MODELS } from '../models';
import { PROMPTS } from './research.prompts';

export interface SearchSources {
  tavily?: string;
  serper?: string;
  naver?: string;
  brave?: string;
  ollama?: string;
}

@Injectable()
export class ResearchService {
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  getModels() {
    return MODELS;
  }

  // ─── 태스크 생성 ────────────────────────────────────────────────────────────

  async generateTasks(topic: string, model: string) {
    // Tavily가 설정된 경우 먼저 검색해서 컨텍스트 확보
    let searchContext: string | undefined;
    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      try {
        searchContext = await this.searchTavily(topic);
      } catch {
        // 검색 실패 시 컨텍스트 없이 진행
      }
    }

    const prompt = PROMPTS.generateTasks(topic, searchContext);
    const raw = await this.callAI(model, prompt, false);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);
    return { tasks };
  }

  // ─── 검색 파이프라인만 실행 ─────────────────────────────────────────────────

  async runSearch(prompt: string): Promise<{ sources: SearchSources; context: string }> {
    if (!this.hasExternalSearch()) {
      return { sources: {}, context: '' };
    }
    const { combined, sources } = await this.runSearchPipeline(prompt);
    return { sources, context: combined };
  }

  // ─── AI 분석 실행 ────────────────────────────────────────────────────────────

  async runResearch(prompt: string, model: string, context = '') {
    const hasExternalSearch = this.hasExternalSearch();
    // context가 넘어오면 외부 검색 결과를 쓴 것이므로 내장 검색 불필요
    const useBuiltinSearch = !hasExternalSearch && !context;
    const result = await this.callAI(model, prompt, useBuiltinSearch, context);
    return { result };
  }

  // ─── 외부 검색 파이프라인 ────────────────────────────────────────────────────

  private hasExternalSearch(): boolean {
    return [
      process.env.TAVILY_API_KEY,
      process.env.SERPER_API_KEY,
      process.env.NAVER_CLIENT_ID,
      process.env.BRAVE_API_KEY,
    ].some((k) => k && !k.startsWith('your_'));
  }

  private async runSearchPipeline(query: string): Promise<{ combined: string; sources: SearchSources }> {
    const pending: { key: keyof SearchSources; promise: Promise<string> }[] = [];

    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      pending.push({ key: 'tavily', promise: this.searchTavily(query) });
    }
    if (process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith('your_')) {
      pending.push({ key: 'serper', promise: this.searchSerper(query) });
    }
    if (process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_')) {
      pending.push({ key: 'naver', promise: this.searchNaver(query) });
    }
    if (process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY.startsWith('your_')) {
      pending.push({ key: 'brave', promise: this.searchBrave(query) });
    }

    const results = await Promise.allSettled(pending.map((p) => p.promise));
    const sources: SearchSources = {};
    const parts: string[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        sources[pending[i].key] = result.value;
        parts.push(result.value);
      }
    });

    const raw = parts.join('\n\n---\n\n');
    const filtered = await this.filterWithOllama(query, raw);
    if (filtered && filtered !== raw) {
      sources.ollama = filtered;
    }

    return { combined: filtered || raw, sources };
  }

  private async searchTavily(query: string): Promise<string> {
    const depth = (process.env.TAVILY_SEARCH_DEPTH || 'basic') as 'basic' | 'advanced';
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
    const response = await client.search(query, {
      searchDepth: depth,
      maxResults: 5,
    });
    return (
      response.results
        .map((r) => `[${r.title}]\n${r.content}\n출처: ${r.url}`)
        .join('\n\n') ?? ''
    );
  }

  private async searchSerper(query: string): Promise<string> {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SERPER_API_KEY!,
      },
      body: JSON.stringify({ q: query, num: 5, hl: 'ko' }),
    });
    const data = (await res.json()) as any;
    return (
      data.organic
        ?.map((r: any) => `[${r.title}]\n${r.snippet}\n출처: ${r.link}`)
        .join('\n\n') ?? ''
    );
  }

  private async searchNaver(query: string): Promise<string> {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=5&sort=date`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      },
    });
    const data = (await res.json()) as any;
    return (
      data.items
        ?.map(
          (r: any) =>
            `[${r.title.replace(/<[^>]*>/g, '')}]\n${r.description.replace(/<[^>]*>/g, '')}\n출처: ${r.link}`,
        )
        .join('\n\n') ?? ''
    );
  }

  private async searchBrave(query: string): Promise<string> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&lang=ko`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_API_KEY!,
      },
    });
    const data = (await res.json()) as any;
    return (
      data.web?.results
        ?.map((r: any) => `[${r.title}]\n${r.description}\n출처: ${r.url}`)
        .join('\n\n') ?? ''
    );
  }

  private async filterWithOllama(query: string, context: string): Promise<string> {
    if (!context) return context;
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const ollamaModel = process.env.OLLAMA_MODEL || 'phi4';
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: PROMPTS.ollamaFilter(query, context),
          stream: false,
        }),
        signal: AbortSignal.timeout(3000000),
      });
      if (!res.ok) return context;
      const data = (await res.json()) as any;
      return data.response || context;
    } catch {
      return context;
    }
  }

  // ─── AI 호출 라우팅 ──────────────────────────────────────────────────────────

  private async callAI(
    model: string,
    prompt: string,
    useBuiltinSearch: boolean,
    context = '',
  ): Promise<string> {
    const system = PROMPTS.system;
    const fullPrompt = context ? PROMPTS.withSearchContext(context, prompt) : prompt;

    if (model.startsWith('claude')) {
      return this.callAnthropic(model, system, fullPrompt, useBuiltinSearch);
    } else if (model.startsWith('gemini')) {
      return this.callGoogle(model, system + '\n\n' + fullPrompt, useBuiltinSearch);
    } else {
      return this.callOpenAI(model, system, fullPrompt);
    }
  }

  private async callAnthropic(
    model: string,
    system: string,
    prompt: string,
    useWebSearch: boolean,
  ): Promise<string> {
    if (useWebSearch) {
      try {
        const response = await this.anthropic.messages.create(
          {
            model,
            max_tokens: 8000,
            system,
            messages: [{ role: 'user', content: prompt }],
            tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
          } as any,
          { headers: { 'anthropic-beta': 'web-search-2025-03-05' } },
        );
        return response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as any).text)
          .join('');
      } catch {
        // 웹 검색 미지원 시 일반 API로 폴백
      }
    }

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('');
  }

  private async callGoogle(
    model: string,
    prompt: string,
    useSearch: boolean,
  ): Promise<string> {
    const config: any = useSearch ? { tools: [{ googleSearch: {} }] } : undefined;
    const response = await this.google.models.generateContent({
      model,
      contents: prompt,
      config,
    });
    return response.text ?? '';
  }

  private async callOpenAI(
    model: string,
    system: string,
    prompt: string,
  ): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices[0].message.content ?? '';
  }
}
