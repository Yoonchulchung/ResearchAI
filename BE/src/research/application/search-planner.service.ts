import { Injectable, Logger } from '@nestjs/common';

export type SearchSource = 'web' | 'recruit' | 'both';

export interface SearchPlan {
  source: SearchSource;
  reason: string;
}

const SYSTEM = '당신은 리서치 쿼리를 분류하는 전문가입니다. JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.';

@Injectable()
export class SearchPlannerService {
  private readonly logger = new Logger(SearchPlannerService.name);

  async plan(topic: string): Promise<SearchPlan> {
    const ollamaModel = process.env.OLLAMA_PLANNER_MODEL
      ?? process.env.OLLAMA_MODEL
      ?? 'llama3.1';
    const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

    const prompt = `다음 리서치 주제를 분석하여 가장 적합한 데이터 소스를 결정하세요.

주제: "${topic}"

데이터 소스:
- "web"    : 웹 검색 (Tavily 등) — 기술 정보, 최신 뉴스, 트렌드, 일반 지식
- "recruit": 채용 공고 크롤러 — 직무 요건, 요구 스킬, 채용 기업, 취업 시장 동향
- "both"   : 웹 검색 + 채용 공고 — 기술과 채용 시장 정보 모두 필요할 때

판단 기준:
- 채용, 취업, 커리어, 직무, 채용 공고, 취업 시장 → "recruit" 또는 "both"
- 기술 개념, 최신 정보, 뉴스, 트렌드, 일반 지식 → "web"
- 특정 기술의 취업 시장 동향, 인기 스택 → "both"

반드시 JSON만 반환:
{ "source": "web" | "recruit" | "both", "reason": "판단 이유 한 문장" }`;

    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) return this.fallback(ollamaModel, topic, 'Ollama 응답 오류');

      const data = (await res.json()) as any;
      const text: string = data.message?.content ?? '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallback(ollamaModel, topic, 'JSON 파싱 실패');

      const parsed = JSON.parse(jsonMatch[0]) as { source?: string; reason?: string };
      if (!(['web', 'recruit', 'both'] as string[]).includes(parsed.source ?? '')) {
        return this.fallback(ollamaModel, topic, '유효하지 않은 source 값');
      }

      const source = parsed.source as SearchSource;

      const plan: SearchPlan = { source, reason: parsed.reason ?? '' };
      this.logger.log(`[플래너] topic="${topic}" model=${ollamaModel} → ${plan.source} | ${plan.reason}`);
      return plan;
    } catch {
      return this.fallback(ollamaModel, topic, 'Ollama 호출 실패 (미설치 또는 타임아웃)');
    }
  }

  private fallback(model: string, topic: string, reason: string): SearchPlan {
    const plan: SearchPlan = { source: 'web', reason: `fallback — ${reason}` };
    this.logger.warn(`[플래너] topic="${topic}" model=${model} → fallback:web (${reason})`);
    return plan;
  }
}
