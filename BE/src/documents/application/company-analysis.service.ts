import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CompanyAnalysisEntity, CompetencyScores } from '../domain/entity/company-analysis.entity';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { WebSearchService } from '../../research/application/web-search.service';
import { JobplanetScraperService } from '../infrastructure/jobplanet-scraper.service';
import { DartFinancialService } from '../infrastructure/dart-financial.service';
import { requestContext } from '../../shared/request-context';

const COMPETENCY_KEYS = [
  '성취지향', '도전정신', '주도성', '문제해결', '의사소통',
  '대인관계', '열정', '주인의식', '팀워크', '자원계획관리',
  '치밀성', '분석적사고', '전문성',
] as const;

const ZERO_SCORES: CompetencyScores = COMPETENCY_KEYS.reduce(
  (acc, k) => ({ ...acc, [k]: 0 }),
  {} as CompetencyScores,
);

export interface CompanyAnalysisProgress {
  type: 'log' | 'searching' | 'scoring' | 'done' | 'error';
  message?: string;
  result?: CompanyAnalysisDto;
}

export type CompetencyReasons = Partial<Record<typeof COMPETENCY_KEYS[number], string>>;

export interface CompanyAnalysisDto {
  id: string;
  companyKey: string;
  companyName: string;
  scores: CompetencyScores;
  reasons: CompetencyReasons | null;
  summary: string | null;
  evidence: { title: string; url: string }[] | null;
  aiModel: string | null;
  financialSummary: string | null;
  jobplanetSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SYSTEM_PROMPT = `당신은 기업 인재상 분석 전문가입니다.
주어진 기업의 인재상·핵심가치·채용 정보를 분석하여 다음 13개 핵심 역량별로 0~100 점수를 매기세요.

## 13개 핵심 역량
1. **성취지향** — 목표 달성·성과 추구·결과 책임
2. **도전정신** — 새로운 시도·리스크 감수·실패 극복
3. **주도성** — 자발적 행동·문제 발견·리더십
4. **문제해결** — 분석·대안 도출·실행력
5. **의사소통** — 명확한 표현·경청·설득
6. **대인관계** — 공감·신뢰·관계 구축
7. **열정** — 몰입·헌신·에너지
8. **주인의식** — 책임감·당사자 의식·long-term 관점
9. **팀워크** — 협업·집단 성과·시너지
10. **자원계획관리** — 자원 배분·계획·관리·효율성
11. **치밀성** — 꼼꼼함·정확성·디테일·완결성
12. **분석적사고** — 데이터·논리·구조화·인사이트
13. **전문성** — 특정 분야 깊이·기술·축적된 지식

## 점수 기준
- 80~100: 회사가 매우 강조 (인재상에 명시적 + 반복 강조)
- 60~79: 회사가 중요시 (직무 요구·문화에 반영)
- 40~59: 평균 수준 (보편적으로 요구되는 정도)
- 20~39: 낮은 비중 (간접 언급만)
- 0~19: 거의 무관 (해당 회사 인재상과 거리)

## 추가 분석 지침
- DART 재무 데이터가 제공된 경우: 기업 규모·성장성을 인재상 추론에 반영하세요
- 잡플래닛 리뷰가 제공된 경우: 실제 직원 경험에서 나타나는 역량 강조 패턴을 반영하세요
- 복지·워라밸 정보도 요약에 포함하세요

## 출력 형식 (JSON 만, 다른 텍스트 금지)
\`\`\`json
{
  "summary": "회사 인재상의 핵심 1~3 문장 요약 (복지·재무 정보도 간략히 포함)",
  "scores": {
    "성취지향": 0,
    "도전정신": 0,
    "주도성": 0,
    "문제해결": 0,
    "의사소통": 0,
    "대인관계": 0,
    "열정": 0,
    "주인의식": 0,
    "팀워크": 0,
    "자원계획관리": 0,
    "치밀성": 0,
    "분석적사고": 0,
    "전문성": 0
  },
  "reasons": {
    "성취지향": "이 점수를 부여한 구체적 근거 1~2문장 (어떤 자료의 어떤 내용에서 판단했는지)",
    "도전정신": "...",
    "주도성": "...",
    "문제해결": "...",
    "의사소통": "...",
    "대인관계": "...",
    "열정": "...",
    "주인의식": "...",
    "팀워크": "...",
    "자원계획관리": "...",
    "치밀성": "...",
    "분석적사고": "...",
    "전문성": "..."
  }
}
\`\`\``;

@Injectable()
export class CompanyAnalysisService {
  private readonly logger = new Logger(CompanyAnalysisService.name);

  constructor(
    @InjectRepository(CompanyAnalysisEntity)
    private readonly repo: Repository<CompanyAnalysisEntity>,
    private readonly aiProvider: AiProviderService,
    private readonly webSearch: WebSearchService,
    private readonly jobplanetScraper: JobplanetScraperService,
    private readonly dartFinancial: DartFinancialService,
  ) {}

  private normalizeKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  }

  async findAll(): Promise<CompanyAnalysisDto[]> {
    const rows = await this.repo.find({ order: { updatedAt: 'DESC' } });
    return rows.map((r) => this.toDto(r));
  }

  async findByKey(companyKey: string): Promise<CompanyAnalysisDto> {
    const row = await this.repo.findOne({ where: { companyKey } });
    if (!row) throw new NotFoundException(`기업 분석 결과 없음: ${companyKey}`);
    return this.toDto(row);
  }

  async findByName(companyName: string): Promise<CompanyAnalysisDto | null> {
    const key = this.normalizeKey(companyName);
    const row = await this.repo.findOne({ where: { companyKey: key } });
    return row ? this.toDto(row) : null;
  }

  async delete(companyKey: string): Promise<void> {
    await this.repo.delete({ companyKey });
  }

  async *analyzeStream(
    companyName: string,
    aiModel: string,
  ): AsyncGenerator<CompanyAnalysisProgress> {
    const key = this.normalizeKey(companyName);
    if (!key) {
      yield { type: 'error', message: '유효하지 않은 기업명' };
      return;
    }

    const creds = requestContext.getStore()?.serviceCredentials ?? {};

    // ── 1. 웹 검색 ──────────────────────────────────────────────────────
    yield { type: 'log', message: `🔍 "${companyName}" 인재상·핵심가치 검색 중...` };
    yield { type: 'searching' };

    let webContext = '';
    let evidence: { title: string; url: string }[] = [];
    try {
      const query = `${companyName} 인재상 핵심가치 채용 공식`;
      const { context: webCtx, sources } = await this.webSearch.runSearch(query);
      webContext = webCtx;
      const sourceList = (sources?.duckduckgo ?? sources?.tavily ?? sources?.serper ?? sources?.naver ?? sources?.brave) as
        | { title: string; url: string }[]
        | string
        | undefined;
      if (Array.isArray(sourceList)) {
        evidence = sourceList.slice(0, 8).map((s) => ({ title: s.title ?? '', url: s.url ?? '' }));
      }
    } catch (err) {
      this.logger.warn(`웹 검색 실패: ${(err as Error).message}`);
    }

    // ── 2. DART 재무 데이터 수집 ─────────────────────────────────────
    let dartText = '';
    if (creds.dartApiKey) {
      yield { type: 'log', message: '📊 DART OpenAPI로 재무 데이터 수집 중...' };
    }

    try {
      const dartData = await this.dartFinancial.fetchCompanyData(
        companyName,
        creds.dartApiKey,
      );
      if (dartData) {
        dartText = this.dartFinancial.formatForAnalysis(dartData);
        yield { type: 'log', message: `✅ DART 데이터 수집 완료 (공시 ${dartData.disclosures.length}건)` };
      } else if (creds.dartApiKey) {
        yield { type: 'log', message: '⚠️ DART 데이터 수집 실패 (API 키 또는 기업명 확인 필요)' };
      }
    } catch (err) {
      this.logger.warn(`DART 수집 실패: ${(err as Error).message}`);
      yield { type: 'log', message: '⚠️ DART 데이터 수집 중 오류 발생' };
    }

    // ── 3. 잡플래닛 리뷰 수집 ────────────────────────────────────────
    let jobplanetText = '';
    if (creds.jobplanetId && creds.jobplanetPassword) {
      yield { type: 'log', message: '💼 잡플래닛 기업 리뷰 수집 중...' };
      try {
        const jpData = await this.jobplanetScraper.scrapeCompany(
          companyName,
          creds.jobplanetId,
          creds.jobplanetPassword,
        );
        if (jpData) {
          jobplanetText = this.jobplanetScraper.formatForAnalysis(jpData);
          yield { type: 'log', message: `✅ 잡플래닛 리뷰 수집 완료 (리뷰 ${jpData.reviewCount}개, 평점 ${jpData.overallRating})` };
        } else {
          yield { type: 'log', message: '⚠️ 잡플래닛 리뷰 수집 실패 (로그인 확인 필요)' };
        }
      } catch (err) {
        this.logger.warn(`잡플래닛 스크래핑 실패: ${(err as Error).message}`);
        yield { type: 'log', message: '⚠️ 잡플래닛 수집 중 오류 발생' };
      }
    }

    if (!webContext.trim() && !dartText && !jobplanetText) {
      yield { type: 'log', message: '⚠️ 수집된 데이터가 부족합니다 — AI 학습 지식으로만 분석합니다' };
    } else {
      yield { type: 'log', message: `✅ 데이터 수집 완료. AI 분석 시작...` };
    }

    yield { type: 'scoring' };

    // ── 4. AI 분석 ──────────────────────────────────────────────────────
    const contextParts: string[] = [];
    if (webContext.trim()) contextParts.push(`## 웹 검색 — 인재상·채용 자료\n${webContext.slice(0, 10000)}`);
    if (dartText) contextParts.push(dartText);
    if (jobplanetText) contextParts.push(jobplanetText);

    const userPrompt = `## 분석 대상 기업\n${companyName}\n\n${contextParts.join('\n\n---\n\n') || '(자료 부족 — 일반 지식 기반 추정)'}`;

    let parsedScores: CompetencyScores = { ...ZERO_SCORES };
    let parsedSummary = '';
    let parsedReasons: CompetencyReasons = {};
    try {
      const { text } = await this.aiProvider.call(aiModel, SYSTEM_PROMPT, userPrompt, {
        caller: 'CompanyAnalysis',
      });
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('JSON 파싱 실패');
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        summary?: string;
        scores?: Partial<CompetencyScores>;
        reasons?: Partial<Record<string, string>>;
      };
      parsedSummary = parsed.summary?.trim() ?? '';
      for (const k of COMPETENCY_KEYS) {
        const v = parsed.scores?.[k];
        parsedScores[k] = typeof v === 'number' ? Math.max(0, Math.min(100, Math.round(v))) : 50;
        const r = parsed.reasons?.[k];
        if (r && typeof r === 'string') parsedReasons[k] = r.trim();
      }
    } catch (err) {
      this.logger.error(`[CompanyAnalysis] AI 분석 실패: ${(err as Error).message}`);
      yield { type: 'error', message: `AI 분석 실패: ${(err as Error).message}` };
      return;
    }

    yield { type: 'log', message: '💾 결과 저장 중...' };

    // ── 5. DB 업서트 ─────────────────────────────────────────────────
    const existing = await this.repo.findOne({ where: { companyKey: key } });
    const id = existing?.id ?? randomUUID();
    const entity = await this.repo.save({
      id,
      companyKey: key,
      companyName: companyName.trim(),
      scores: JSON.stringify(parsedScores),
      reasons: Object.keys(parsedReasons).length > 0 ? JSON.stringify(parsedReasons) : null,
      summary: parsedSummary || null,
      evidence: evidence.length > 0 ? JSON.stringify(evidence) : null,
      aiModel: aiModel || null,
      financialSummary: dartText || null,
      jobplanetSummary: jobplanetText || null,
    });

    yield { type: 'done', result: this.toDto(entity) };
  }

  private toDto(e: CompanyAnalysisEntity): CompanyAnalysisDto {
    let scores: CompetencyScores;
    try { scores = JSON.parse(e.scores); } catch { scores = { ...ZERO_SCORES }; }
    let reasons: CompetencyReasons | null = null;
    try { reasons = e.reasons ? JSON.parse(e.reasons) : null; } catch { reasons = null; }
    let evidence: { title: string; url: string }[] | null = null;
    try { evidence = e.evidence ? JSON.parse(e.evidence) : null; } catch { evidence = null; }
    return {
      id: e.id,
      companyKey: e.companyKey,
      companyName: e.companyName,
      scores,
      reasons,
      summary: e.summary,
      evidence,
      aiModel: e.aiModel,
      financialSummary: e.financialSummary ?? null,
      jobplanetSummary: e.jobplanetSummary ?? null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
