import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import {
  SearchMode,
  PlannerMode,
  SearchPlan,
} from 'src/research/domain/model/search-planner.model';
import { AI_MODEL_PREFIX } from 'src/ai/domain/models';

export type SearchModeInput = SearchMode | PlannerMode;

const SYSTEM =
  '당신은 리서치 쿼리를 분류하는 전문가입니다. JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.';

@Injectable()
export class SearchPlannerService {
  private readonly logger = new Logger(SearchPlannerService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async plan(topic: string, localAIModel?: string): Promise<SearchPlan> {
    // 모델 ID → 적절한 provider prefix 적용
    // - 빈 문자열(""): 기본 무료 AI (Gemini) 사용
    // - claude-*, gemini-*, gpt-*, o1*, o3*: 클라우드 모델 — 그대로 사용
    // - ollama:*, llama:*: 이미 prefix 포함 — 그대로 사용
    // - 그 외 bare 이름 (llama3.1, phi4:latest 등): Ollama local 모델로 간주 → ollama: prefix 추가
    const CLOUD_PREFIXES = [
      AI_MODEL_PREFIX.ANTHROPIC, // 'claude'
      AI_MODEL_PREFIX.GOOGLE, // 'gemini'
      'gpt-',
      'o1',
      'o3', // OpenAI 계열
    ];

    let aiModel: string;
    if (localAIModel !== undefined) {
      const trimmed = localAIModel.trim();
      if (trimmed === '') {
        aiModel = ''; // DEFAULT_AI_MODEL (Gemini 무료) 로 폴백
      } else if (
        trimmed.startsWith(AI_MODEL_PREFIX.OLLAMA) ||
        trimmed.startsWith(AI_MODEL_PREFIX.LLAMA_CPP) ||
        CLOUD_PREFIXES.some((p) =>
          trimmed.toLowerCase().startsWith(p.toLowerCase()),
        )
      ) {
        aiModel = trimmed; // 이미 provider 식별 가능 — 그대로 사용
      } else {
        aiModel = `${AI_MODEL_PREFIX.OLLAMA}${trimmed}`; // bare 로컬 모델명 → Ollama로 간주
      }
    } else {
      const envModel =
        process.env.OLLAMA_PLANNER_MODEL ??
        process.env.OLLAMA_MODEL ??
        'llama3.1';
      aiModel = envModel.startsWith(AI_MODEL_PREFIX.OLLAMA)
        ? envModel
        : `${AI_MODEL_PREFIX.OLLAMA}${envModel}`;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDate = `${currentYear}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `다음 리서치 주제를 분석하여 가장 적합한 서칭 방법과 키워드를 결정하세요.

오늘 날짜: ${currentDate}

주제: "${topic}"

## 데이터 소스 선택 규칙 (우선순위 순)

1. **"recruit"** — 주제에 "채용 공고", "채용", "취업", "공고", "직무", "포지션" 등이 포함되거나 구직 목적인 경우
   - 예: "FastAPI 개발자 채용 공고", "2025년 백엔드 채용 동향", "AI 엔지니어 취업"
   - ⚠️ "채용 동향", "취업 시장 동향" 같이 트렌드 표현이 있어도 채용 공고 검색이 목적이면 → **"recruit"**

2. **"both"** — 특정 회사에 지원하거나, 특정 기업의 채용과 기업 정보를 함께 조사하는 경우
   - 예: "카카오 개발자 채용 준비", "네이버 입사 전략"

3. **"web"** — 순수 기술 정보, 제품 비교, 개념 학습, 기업 정보(채용 아님)
   - 예: "FastAPI vs Django 비교", "React 최신 트렌드", "삼성 사업 전략"

반드시 JSON만 반환:
{ "source": "web" | "recruit" | "both", "keywords": "검색 키워드", "companyTypes": ["대기업"], "jobTypes": ["신입"] }

## keywords 작성 규칙

- **"recruit"** 또는 **"both"**: 채용 공고 사이트 검색창에 입력하는 **짧은 직무·기술 키워드** (2~4단어)
  - 반드시 제거: 연도(2025년), 지역(서울, 수도권), "채용 공고", "구인 정보", "채용 동향", "취업 시장" 등 메타 표현
  - 남길 것: 직무명 + 핵심 기술명 (+ 기업명이 명시된 경우)
  - 예시:
    - "2025년 서울 FastAPI 개발자 채용 공고" → **"FastAPI 개발자"**
    - "최신 CI/CD DevOps 채용 동향" → **"DevOps 엔지니어 CI/CD"**
    - "카카오 백엔드 신입 채용" → **"카카오 백엔드 개발자"**
    - "AI 엔지니어 취업 준비" → **"AI 엔지니어"**
- **"web"**: 검색 엔진에 입력할 자연어 검색 문장 (연도·지역 포함 가능)
  - 예: "FastAPI 최신 트렌드 2025" / "AI 스타트업 현황"
- 단일 검색어 문자열로 반환 (배열 아님)

## companyTypes
- 주제에서 특정 기업 이름이 명시된 경우만 추출. 없으면 빈 배열 []

## jobTypes
- 주제에서 신입/경력 등 채용 구분이 명시된 경우만 추출. 없으면 빈 배열 []`;

    try {
      const { text } = await this.aiProvider.call(aiModel, SYSTEM, prompt);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.fallback(aiModel, topic, 'JSON 파싱 실패');

      const parsed = JSON.parse(jsonMatch[0]) as {
        source?: string;
        keywords?: unknown;
        companyTypes?: unknown;
        jobTypes?: unknown;
      };
      if (
        !(Object.values(SearchMode) as string[]).includes(parsed.source ?? '')
      ) {
        return this.fallback(aiModel, topic, '유효하지 않은 source 값');
      }

      const searchMode = parsed.source as SearchMode;

      const keyword =
        typeof parsed.keywords === 'string' && parsed.keywords.trim()
          ? parsed.keywords.trim()
          : topic;

      const companyTypes =
        Array.isArray(parsed.companyTypes) && parsed.companyTypes.length > 0
          ? (parsed.companyTypes as string[]).filter(
              (v) => typeof v === 'string',
            )
          : undefined;
      const jobTypes =
        Array.isArray(parsed.jobTypes) && parsed.jobTypes.length > 0
          ? (parsed.jobTypes as string[]).filter((v) => typeof v === 'string')
          : undefined;

      const plan: SearchPlan = {
        searchMode,
        reason: '',
        keyword,
        companyTypes,
        jobTypes,
        model: aiModel,
      };
      return plan;
    } catch {
      return this.fallback(
        aiModel,
        topic,
        'Ollama 호출 실패 (미설치 또는 타임아웃)',
      );
    }
  }

  private fallback(model: string, topic: string, reason: string): SearchPlan {
    const plan: SearchPlan = {
      searchMode: SearchMode.WEB,
      reason: `fallback — ${reason}`,
      keyword: topic,
      model,
    };
    this.logger.warn(
      `[플래너] topic="${topic}" model=${model} → fallback:web (${reason})`,
    );
    return plan;
  }
}
