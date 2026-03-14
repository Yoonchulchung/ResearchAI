import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../../ai/application/ai-provider.service';
import { SearchMode, PlannerMode, SearchPlan } from '../domain/model/search-planner.model';
import { AI_MODEL_PREFIX } from '../../ai/domain/models';


export type SearchModeInput = SearchMode | PlannerMode;

const SYSTEM = '당신은 리서치 쿼리를 분류하는 전문가입니다. JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.';


@Injectable()
export class SearchPlannerService {
  private readonly logger = new Logger(SearchPlannerService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async plan(topic: string, localAIModel?: string): Promise<SearchPlan> {
    const rawModel = localAIModel
      ?? process.env.OLLAMA_PLANNER_MODEL
      ?? process.env.OLLAMA_MODEL
      ?? 'llama3.1';
    const aiModel = rawModel.startsWith(AI_MODEL_PREFIX.OLLAMA)
      ? rawModel
      : `${AI_MODEL_PREFIX.OLLAMA}${rawModel}`;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDate = `${currentYear}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `다음 리서치 주제를 분석하여 가장 적합한 서칭 방법 결정과 주제를 생성하세요.

오늘 날짜: ${currentDate}

주제: "${topic}"

데이터 소스:
- "web"    : 기술 정보, 기업 정보, 지식, 트렌드
- "recruit": 채용 공고, 직무 요건, 요구 스킬, 채용 기업, 취업 시장 동향
- "both"   : web + recruit로 기술과 채용 시장 정보 모두 필요할 때

판단 기준:
1. recruit: 주제가 취업 공고 검색과 관련
2. both: 주제가 취업 공고와 기업 관련 조사
3. web: 주제가 순수 기술 정보, 뉴스, 트렌드, 개념 질문

반드시 JSON만 반환:
{ "source": "web" | "recruit" | "both", "keywords": "검색 키워드", "companyTypes": ["대기업"], "jobTypes": ["신입"] }

keywords 규칙:
- 데이터 소스가 "recruit", 주제를 검색에 최적화된 키워드로 변환
- 데이터 소스가 "web", 주제를 검색할 수 있는 검색 문장으로 반환
- 데이터 소스가 "both", 직무명/기술명을 중심으로 채용 공고 검색에 최적화되어 반환
  (예: "최신 CI/CD 공고 찾아줘" → ["CI/CD DevOps 엔지니어" or "DevOps 개발자 채용" or "CI/CD 파이프라인 엔지니어"])
- 각 후보는 2~20 단어 조합, 검색창에 바로 붙여넣을 수 있는 형태

companyTypes 판단 기준.
- 주제에서 기업 이름을 추출해 판단.
- 없으면 빈 배열

jobTypes 판단 기준.
- 주제에서 채용 포지션 추출.
- 없으면 빈 배열`;

    try {
      const text = await this.aiProvider.call(aiModel, SYSTEM, prompt);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallback(rawModel, topic, 'JSON 파싱 실패');

      const parsed = JSON.parse(jsonMatch[0]) as {
        source?: string;
        keywords?: unknown;
        companyTypes?: unknown;
        jobTypes?: unknown;
      };
      if (!(Object.values(SearchMode) as string[]).includes(parsed.source ?? '')) {
        return this.fallback(rawModel, topic, '유효하지 않은 source 값');
      }

      const searchMode = parsed.source as SearchMode;

      const keyword = typeof parsed.keywords === 'string' && parsed.keywords.trim()
        ? parsed.keywords.trim()
        : topic;

      const companyTypes = Array.isArray(parsed.companyTypes) && parsed.companyTypes.length > 0
        ? (parsed.companyTypes as string[]).filter((v) => typeof v === 'string')
        : undefined;
      const jobTypes = Array.isArray(parsed.jobTypes) && parsed.jobTypes.length > 0
        ? (parsed.jobTypes as string[]).filter((v) => typeof v === 'string')
        : undefined;

      const plan: SearchPlan = { searchMode, reason: '', keyword, companyTypes, jobTypes, model: rawModel };
      this.logger.log(
        `[플래너] topic="${topic}" model=${rawModel} → ${plan.searchMode} | keyword="${keyword}"` +
        `${companyTypes ? ` | 기업유형: ${companyTypes.join(', ')}` : ''}` +
        `${jobTypes ? ` | 경력: ${jobTypes.join(', ')}` : ''}`,
      );
      return plan;
    } catch {
      return this.fallback(rawModel, topic, 'Ollama 호출 실패 (미설치 또는 타임아웃)');
    }
  }

  private fallback(model: string, topic: string, reason: string): SearchPlan {
    const plan: SearchPlan = { searchMode: SearchMode.WEB, reason: `fallback — ${reason}`, keyword: topic, model };
    this.logger.warn(`[플래너] topic="${topic}" model=${model} → fallback:web (${reason})`);
    return plan;
  }
}
