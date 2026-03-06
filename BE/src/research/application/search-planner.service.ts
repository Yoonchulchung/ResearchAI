import { Injectable, Logger } from '@nestjs/common';
import { callOllama } from '../../ai/infrastructure/ollama.ai';

export type SearchSource = 'web' | 'recruit' | 'both';

export interface SearchPlan {
  source: SearchSource;
  reason: string;
  keyword: string;
  companyTypes?: string[];
  jobTypes?: string[];
  model?: string;
}

const SYSTEM = '당신은 리서치 쿼리를 분류하는 전문가입니다. JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.';

@Injectable()
export class SearchPlannerService {
  private readonly logger = new Logger(SearchPlannerService.name);

  async plan(topic: string): Promise<SearchPlan> {
    const ollamaModel = process.env.OLLAMA_PLANNER_MODEL
      ?? process.env.OLLAMA_MODEL
      ?? 'llama3.1';

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
{ "source": "web" | "recruit" | "both", "reason": "판단 이유 한 문장", "keyword": "검색 엔진 최적화된 키워드", "companyTypes": ["대기업", "중견기업"], "jobTypes": ["신입"] }

keyword 변환 규칙:
- 사용자의 자연어 요청을 검색 엔진에 최적화된 키워드로 변환한다
- "찾아줘", "알려줘", "어때?", "궁금해" 등 요청 동사와 한국어 조사(을/를/이/가/의/에/에서/으로)를 모두 제거
- source가 "recruit" 또는 "both"일 때: 직무명/기술명을 그대로 살려 채용 공고 검색에 최적화된 키워드로 변환, 의미를 임의로 확장하거나 바꾸지 말 것 (예: "FastAPI 공고 찾아줘" → "FastAPI 백엔드 개발자", "파이썬 엔지니어 취업" → "Python 개발자", "리액트 신입 채용" → "React 프론트엔드 개발자 신입")
- source가 "web"일 때: 정보성 검색어로 변환, 영어 기술 용어 병기 권장 (예: "리액트 상태관리 요즘 트렌드" → "React state management 트렌드 2025", "도커 쿠버네티스 차이" → "Docker Kubernetes 차이점 비교")
- 너무 짧으면 맥락 보완 (예: "FastAPI" → "FastAPI Python 백엔드"), 너무 길면 핵심만 남김
- 결과는 검색창에 바로 붙여넣을 수 있는 2~6 단어 조합

companyTypes 판단 기준 (해당하는 것 모두 배열에 포함, 없으면 빈 배열 []):
- 대기업, 삼성, 현대, LG, SK, 카카오, 네이버, 쿠팡 등 언급 → "대기업"
- 중견기업 언급 → "중견기업"
- 중소기업, 소규모 언급 → "중소기업"
- 스타트업, 벤처 언급 → "스타트업"
- 외국계, 글로벌 기업 언급 → "외국계"
- 공기업, 공공기관 언급 → "공기업"
- 기업 규모 언급 없음 → []

jobTypes 판단 기준 (해당하는 것 모두 배열에 포함, 없으면 빈 배열 []):
- 신입, 신입 채용, 경력 없음, 갓 졸업 언급 → "신입"
- 경력, 경력직, n년 이상, 시니어 언급 → "경력"
- 인턴, 인턴십 언급 → "인턴"
- 경력 구분 언급 없음 → []`;

    try {
      const text = await callOllama(ollamaModel, SYSTEM, prompt, 60_000);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallback(ollamaModel, topic, 'JSON 파싱 실패');

      const parsed = JSON.parse(jsonMatch[0]) as { source?: string; reason?: string; keyword?: string; companyTypes?: unknown; jobTypes?: unknown };
      if (!(['web', 'recruit', 'both'] as string[]).includes(parsed.source ?? '')) {
        return this.fallback(ollamaModel, topic, '유효하지 않은 source 값');
      }

      const source = parsed.source as SearchSource;
      const keyword = parsed.keyword?.trim() || topic;
      const companyTypes = Array.isArray(parsed.companyTypes) && parsed.companyTypes.length > 0
        ? (parsed.companyTypes as string[]).filter((v) => typeof v === 'string')
        : undefined;
      const jobTypes = Array.isArray(parsed.jobTypes) && parsed.jobTypes.length > 0
        ? (parsed.jobTypes as string[]).filter((v) => typeof v === 'string')
        : undefined;

      const plan: SearchPlan = { source, reason: parsed.reason ?? '', keyword, companyTypes, jobTypes, model: ollamaModel };
      this.logger.log(
        `[플래너] topic="${topic}" model=${ollamaModel} → ${plan.source} | keyword="${keyword}"` +
        `${companyTypes ? ` | 기업유형: ${companyTypes.join(', ')}` : ''}` +
        `${jobTypes ? ` | 경력: ${jobTypes.join(', ')}` : ''}` +
        ` | ${plan.reason}`,
      );
      return plan;
    } catch {
      return this.fallback(ollamaModel, topic, 'Ollama 호출 실패 (미설치 또는 타임아웃)');
    }
  }

  private fallback(model: string, topic: string, reason: string): SearchPlan {
    const plan: SearchPlan = { source: 'web', reason: `fallback — ${reason}`, keyword: topic, model };
    this.logger.warn(`[플래너] topic="${topic}" model=${model} → fallback:web (${reason})`);
    return plan;
  }
}
