import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../../ai/application/ai-provider.service';
import { SearchMode, PlannerMode, SearchPlan } from '../domain/model/search-planner.model';
import { AI_MODEL_PREFIX } from '../../ai/domain/models';


export type SearchModeInput = SearchMode | PlannerMode;

const SYSTEM = '당신은 리서치 쿼리를 분류하는 전문가입니다. JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.';

// recruit 모드에서 keyword 선택에 가산점을 주는 직무 관련 단어
const RECRUIT_BOOST_TERMS = ['개발자', '엔지니어', '디자이너', '기획자', '매니저', '분석가', 'developer', 'engineer'];
// web 모드에서 최신성 관련 단어
const WEB_TREND_TERMS = ['트렌드', '동향', '최신', '현황', 'trend', 'latest'];

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

    const prompt = `다음 리서치 주제를 분석하여 가장 적합한 데이터 소스를 결정하세요.

오늘 날짜: ${currentDate}

주제: "${topic}"

데이터 소스:
- "web"    : 웹 검색 (Tavily 등) — 기술 정보, 최신 뉴스, 트렌드, 일반 지식
- "recruit": 채용 공고 크롤러 — 직무 요건, 요구 스킬, 채용 기업, 취업 시장 동향
- "both"   : 웹 검색 + 채용 공고 — 기술과 채용 시장 정보 모두 필요할 때

판단 기준 (우선순위 순):
1. 주제에 "공고", "채용", "취업", "구직", "커리어", "직무", "포지션" 등 채용 관련 단어가 있으면 반드시 "recruit" 또는 "both"
2. "최신", "트렌드", "동향" 같은 단어가 있어도 채용 관련 단어가 함께 있으면 채용 우선
3. 순수 기술 정보, 뉴스, 트렌드, 개념 질문 → "web"
4. 특정 기술의 취업 시장 동향, 인기 스택 → "both"

반드시 JSON만 반환:
{ "source": "web" | "recruit" | "both", "reason": "판단 이유 한 문장", "keywords": ["후보1", "후보2", "후보3"], "companyTypes": ["대기업"], "jobTypes": ["신입"] }

keywords 규칙 (정확히 3개 생성, 각각 다른 관점):
- 사용자의 자연어 요청을 검색에 최적화된 키워드 후보 3개로 변환
- "찾아줘", "알려줘", "어때?", "궁금해" 등 요청 동사와 한국어 조사(을/를/이/가/의/에/에서/으로)를 모두 제거
- source가 "recruit" 또는 "both"일 때: 직무명/기술명을 중심으로 채용 공고 검색에 최적화된 3가지 변형 생성
  (예: "최신 CI/CD 공고 찾아줘" → ["CI/CD DevOps 엔지니어", "DevOps 개발자 채용", "CI/CD 파이프라인 엔지니어"])
- source가 "web"일 때: 정보성 검색어 3가지, 최신/트렌드 쿼리에는 ${currentYear} 연도 포함
  (예: "최신 CI/CD 동향" → ["CI/CD 트렌드 ${currentYear}", "DevOps CI/CD 최신 동향", "CI/CD pipeline best practices ${currentYear}"])
- 각 후보는 2~6 단어 조합, 검색창에 바로 붙여넣을 수 있는 형태

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
      const text = await this.aiProvider.call(aiModel, SYSTEM, prompt);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallback(rawModel, topic, 'JSON 파싱 실패');

      const parsed = JSON.parse(jsonMatch[0]) as {
        source?: string;
        reason?: string;
        keywords?: unknown;
        keyword?: string;  // 구형 단일 필드 fallback
        companyTypes?: unknown;
        jobTypes?: unknown;
      };
      if (!(Object.values(SearchMode) as string[]).includes(parsed.source ?? '')) {
        return this.fallback(rawModel, topic, '유효하지 않은 source 값');
      }

      const searchMode = parsed.source as SearchMode;

      // keywords 배열 파싱 (구형 keyword 단일 필드도 지원)
      const rawCandidates = Array.isArray(parsed.keywords)
        ? (parsed.keywords as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
        : parsed.keyword?.trim()
          ? [parsed.keyword.trim()]
          : [];

      const keywordCandidates = rawCandidates.length > 0 ? rawCandidates : [topic];
      const keyword = this.selectKeyword(keywordCandidates, searchMode, currentYear);

      const companyTypes = Array.isArray(parsed.companyTypes) && parsed.companyTypes.length > 0
        ? (parsed.companyTypes as string[]).filter((v) => typeof v === 'string')
        : undefined;
      const jobTypes = Array.isArray(parsed.jobTypes) && parsed.jobTypes.length > 0
        ? (parsed.jobTypes as string[]).filter((v) => typeof v === 'string')
        : undefined;

      const plan: SearchPlan = { searchMode, reason: parsed.reason ?? '', keyword, keywordCandidates, companyTypes, jobTypes, model: rawModel };
      this.logger.log(
        `[플래너] topic="${topic}" model=${rawModel} → ${plan.searchMode} | keyword="${keyword}"` +
        ` | candidates=[${keywordCandidates.join(' / ')}]` +
        `${companyTypes ? ` | 기업유형: ${companyTypes.join(', ')}` : ''}` +
        `${jobTypes ? ` | 경력: ${jobTypes.join(', ')}` : ''}` +
        ` | ${plan.reason}`,
      );
      return plan;
    } catch {
      return this.fallback(rawModel, topic, 'Ollama 호출 실패 (미설치 또는 타임아웃)');
    }
  }

  /**
   * 후보 키워드 중 searchMode에 가장 적합한 것을 선택합니다.
   * 점수가 같으면 첫 번째 후보를 사용합니다.
   */
  private selectKeyword(candidates: string[], searchMode: SearchMode, currentYear: number): string {
    if (candidates.length === 1) return candidates[0];

    const scored = candidates.map((kw) => ({ kw, score: this.scoreKeyword(kw, searchMode, currentYear) }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].kw;
  }

  private scoreKeyword(kw: string, searchMode: SearchMode, currentYear: number): number {
    let score = 0;
    const lower = kw.toLowerCase();

    // 길이 선호: 너무 짧거나 너무 긴 것 패널티
    const words = kw.trim().split(/\s+/).length;
    if (words >= 2 && words <= 5) score += 2;
    if (words === 1) score -= 1;
    if (words > 6) score -= 1;

    if (searchMode === SearchMode.RECRUIT || searchMode === SearchMode.BOTH) {
      // recruit: 직무 관련 단어 포함 시 가산점
      for (const term of RECRUIT_BOOST_TERMS) {
        if (lower.includes(term)) { score += 3; break; }
      }
      // 연도가 붙은 키워드는 recruit에 부적절 → 감점
      if (lower.includes(String(currentYear))) score -= 2;
    }

    if (searchMode === SearchMode.WEB) {
      // web: 트렌드/최신 관련 단어 + 연도 조합이면 가산점
      const hasTrend = WEB_TREND_TERMS.some((t) => lower.includes(t));
      const hasYear = lower.includes(String(currentYear));
      if (hasTrend && hasYear) score += 3;
      else if (hasYear) score += 1;
      // 영어 단어 포함 시 가산점 (기술 검색에 유리)
      if (/[a-zA-Z]/.test(kw)) score += 1;
    }

    return score;
  }

  private fallback(model: string, topic: string, reason: string): SearchPlan {
    const plan: SearchPlan = { searchMode: SearchMode.WEB, reason: `fallback — ${reason}`, keyword: topic, model };
    this.logger.warn(`[플래너] topic="${topic}" model=${model} → fallback:web (${reason})`);
    return plan;
  }
}
