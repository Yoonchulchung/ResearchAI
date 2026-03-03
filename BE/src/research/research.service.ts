import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../models';

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
    const prompt = `리서치 주제: "${topic}"

이 주제에 대한 심층 리서치를 위해 5~7개의 조사 항목을 생성하세요.
반드시 아래 JSON 배열 형식만 반환하세요 (다른 텍스트, 마크다운 코드블록 없이):
[
  {
    "id": 1,
    "title": "항목 제목 (간결하게 10자 이내)",
    "icon": "관련 이모지 1개",
    "prompt": "AI에게 전달할 상세 검색 프롬프트. 반드시 한국어로 답하도록 지시 포함."
  }
]`;

    const raw = await this.callAI(model, prompt, false);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태스크 생성 실패: JSON 파싱 오류');
    const tasks = JSON.parse(jsonMatch[0]);
    return { tasks };
  }

  // ─── 리서치 실행 ────────────────────────────────────────────────────────────

  async runResearch(prompt: string, model: string) {
    const hasExternalSearch = this.hasExternalSearch();

    let context = '';
    if (hasExternalSearch) {
      context = await this.runSearchPipeline(prompt);
    }

    const result = await this.callAI(model, prompt, !hasExternalSearch, context);
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

  private async runSearchPipeline(query: string): Promise<string> {
    const searches: Promise<string>[] = [];

    if (process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY.startsWith('your_')) {
      searches.push(this.searchTavily(query));
    }
    if (process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith('your_')) {
      searches.push(this.searchSerper(query));
    }
    if (process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_ID.startsWith('your_')) {
      searches.push(this.searchNaver(query));
    }
    if (process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY.startsWith('your_')) {
      searches.push(this.searchBrave(query));
    }

    const results = await Promise.allSettled(searches);
    const combined = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<string>).value)
      .filter(Boolean)
      .join('\n\n---\n\n');

    // Ollama 필터링 (graceful skip)
    return this.filterWithOllama(query, combined);
  }

  private async searchTavily(query: string): Promise<string> {
    const depth = process.env.TAVILY_SEARCH_DEPTH || 'basic';
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: depth,
        max_results: 5,
      }),
    });
    const data = (await res.json()) as any;
    return (
      data.results
        ?.map((r: any) => `[${r.title}]\n${r.content}\n출처: ${r.url}`)
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
      const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: `질문: "${query}"\n\n다음 검색 결과 중 질문과 관련된 핵심 내용만 추출하여 간결하게 정리하세요.\n\n${context}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
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
    const system =
      '당신은 전문 리서치 어시스턴트입니다. 최신 정보를 기반으로 한국어로 상세하고 구조화된 마크다운 형식으로 답변하세요.';

    const fullPrompt = context
      ? `다음 검색 결과를 바탕으로 아래 질문에 한국어로 상세하게 답하세요. 마크다운 형식으로 작성하세요.\n\n[검색 결과]\n${context}\n\n[질문]\n${prompt}`
      : prompt;

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
