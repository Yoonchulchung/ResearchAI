import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CoverLetter,
  CoverLetterJobAnalysis,
  CoverLetterJobAnalysisRequest,
  JobCategoryTarget,
} from 'src/recruit/domain/cover-letter/cover-letter.model';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import {
  SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS,
  SPEC_ANALYSIS_MAX_ITEMS,
  SPEC_ANALYSIS_TOKEN_BUDGET,
  entityToJobAnalysis,
  estimateTokens,
  extractJson,
  matchesTarget,
  normalizeJobAnalysis,
  toCoverLetter,
} from './cover-letter.utils';

@Injectable()
export class CoverLetterSpecAnalysisService {
  constructor(
    @InjectRepository(CoverLetterEntity)
    private readonly coverLetterRepo: Repository<CoverLetterEntity>,
    @InjectRepository(CoverLetterSpecAnalysisEntity)
    private readonly specAnalysisRepo: Repository<CoverLetterSpecAnalysisEntity>,
    private readonly aiProvider: AiProviderService,
  ) {}

  async analyzeJobsWithAi(request: CoverLetterJobAnalysisRequest = {}): Promise<{
    items: CoverLetterJobAnalysis[];
    target: JobCategoryTarget;
    analyzedAt: string;
    model: string;
  }> {
    const target: JobCategoryTarget = request.target ?? 'IT+전자';
    const limit = Math.min(Math.max(request.limit ?? 20, 1), SPEC_ANALYSIS_MAX_ITEMS);
    const idSet = new Set((request.ids ?? []).filter(Boolean));
    const entities =
      idSet.size > 0
        ? await this.coverLetterRepo.find({ where: { id: In([...idSet]) } })
        : await this.coverLetterRepo.find({
            where: { isHidden: false },
            order: { collectedAt: 'DESC', createdAt: 'DESC' },
            take: limit,
          });
    const allCoverLetters = entities.map((entity) => toCoverLetter(entity));

    const allIds = allCoverLetters.map((item) => item.id);
    const cached = allIds.length > 0
      ? await this.specAnalysisRepo.find({ where: { coverLetterId: In(allIds) } })
      : [];
    const cachedMap = new Map(cached.map((row) => [row.coverLetterId, row]));

    const cachedResults: CoverLetterJobAnalysis[] = cached
      .map((row) => entityToJobAnalysis(row))
      .filter((item) => matchesTarget(item.jobCategory, target));

    const unanalyzed = allCoverLetters.filter((item) => !cachedMap.has(item.id));
    const candidates = this.limitCandidates(unanalyzed, limit, SPEC_ANALYSIS_TOKEN_BUDGET);

    if (candidates.length === 0) {
      return { items: cachedResults, target, analyzedAt: new Date().toISOString(), model: request.model || '' };
    }

    const model = request.model || '';
    const system = [
      '너는 채용 자기소개서 데이터를 분류하는 한국어 HR 데이터 분析 에이전트다.',
      '목표는 자소서 본문과 메타 정보에서 지원자의 학력, 전공, 학점, 어학, 자격증, 인턴/경력, 대외활동, 수상, 직무 기술을 최대한 구조화하는 것이다.',
      '직무 분류는 보조 정보이며, 스펙 추출을 더 중요하게 처리한다.',
      '직무명이 애매하면 본문을 근거로 판단하되, 호텔/영업/서비스/인사/회계/마케팅/리서치 등은 IT나 전자로 과분류하지 않는다.',
      '반드시 JSON만 출력한다.',
    ].join('\n');
    const prompt = this.buildPrompt(candidates, target);
    const effectiveModel = this.aiProvider.resolveEffectiveModel(model);
    const { text } = await this.aiProvider.call(model, system, prompt, {
      caller: 'cover-letter-job-analysis',
    });

    const parsed = this.parseResultJson(text);
    const validIds = new Set(candidates.map((item) => item.id));
    const newItems = parsed
      .filter((item: CoverLetterJobAnalysis) => validIds.has(item.id))
      .map((item: CoverLetterJobAnalysis) => normalizeJobAnalysis(item));

    if (newItems.length > 0) {
      const specEntities = newItems.map((item) => {
        const spec = item.extractedSpec;
        return this.specAnalysisRepo.create({
          coverLetterId: item.id,
          jobCategory: item.jobCategory,
          confidence: item.confidence / 100,
          reason: item.reason || null,
          extractedSpec: null,
          school: spec.school || null,
          major: spec.major || null,
          gpa: spec.gpa || null,
          languages: spec.languages?.length ? JSON.stringify(spec.languages) : null,
          certificates: spec.certificates?.length ? JSON.stringify(spec.certificates) : null,
          internships: spec.internships?.length ? JSON.stringify(spec.internships) : null,
          activities: spec.activities?.length ? JSON.stringify(spec.activities) : null,
          awards: spec.awards?.length ? JSON.stringify(spec.awards) : null,
          skills: spec.skills?.length ? JSON.stringify(spec.skills) : null,
          specSummary: spec.summary || null,
          model: effectiveModel || null,
        });
      });
      await this.specAnalysisRepo.save(specEntities);
    }

    const filteredNew = newItems.filter((item) => matchesTarget(item.jobCategory, target));
    return { items: [...cachedResults, ...filteredNew], target, analyzedAt: new Date().toISOString(), model: effectiveModel };
  }

  async getSpecAnalyses(ids: string[]): Promise<CoverLetterJobAnalysis[]> {
    if (ids.length === 0) return [];
    const rows = await this.specAnalysisRepo.find({ where: { coverLetterId: In(ids) } });
    return rows.map((row) => entityToJobAnalysis(row));
  }

  private limitCandidates(items: CoverLetter[], limit: number, tokenBudget: number): CoverLetter[] {
    const result: CoverLetter[] = [];
    let usedTokens = 0;
    for (const item of items) {
      if (result.length >= limit) break;
      const estimated = this.estimateItemTokens(item);
      if (result.length > 0 && usedTokens + estimated > tokenBudget) break;
      result.push(item);
      usedTokens += estimated;
    }
    return result;
  }

  private estimateItemTokens(item: CoverLetter): number {
    const text = [
      item.company, item.position, item.season, item.spec,
      ...item.questions.slice(0, 3).flatMap((q) => [
        q.question,
        q.answer.slice(0, SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS),
      ]),
    ]
      .filter(Boolean)
      .join('\n');
    return estimateTokens(text);
  }

  private buildPrompt(items: CoverLetter[], target: JobCategoryTarget): string {
    const rows = items.map((item) => ({
      id: item.id,
      company: item.company,
      position: item.position,
      season: item.season,
      spec: item.spec,
      sampleQuestions: item.questions.slice(0, 3).map((q) => ({
        question: q.question,
        answerPreview: q.answer.slice(0, SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS),
      })),
    }));

    return `
다음 자기소개서 목록을 분析해줘. 가장 중요한 작업은 합격자의 정량/정성 스펙을 뽑는 것이다.

직무 카테고리 분류 기준:
- IT: 백엔드, 프론트엔드, 풀스택, 앱, 웹, 소프트웨어, 데이터, AI, ML, 보안, 클라우드, 인프라, 서버, 네트워크, QA, 디지털/플랫폼 중심 서비스기획.
- 전자: 반도체, 회로, 하드웨어, 임베디드, 펌웨어, 디스플레이, 전기전자, 제어, 통신장비, 생산기술 중 전자/반도체/하드웨어 중심.
- 영업: 국내영업, 해외영업, B2B/B2C 영업, 세일즈, 거래처 관리, 고객 관리.
- 경영/기획: 전략기획, 사업기획, 사업개발, 경영기획, 컨설팅, 프로젝트 매니저(비IT), BM.
- 마케팅: 브랜드마케팅, 디지털마케팅, 콘텐츠, 광고, 홍보, PR, SNS, 퍼포먼스마케팅.
- 인사/총무: 채용, HR, 인재개발, 교육, 노무, 총무, 경영지원, 조직문화.
- 재무/회계: 회계, 세무, 재무, 자금, 원가, 재무분析, 금융, 투자.
- 생산/제조: 품질관리, 생산관리, 공정관리, SCM, 물류, 구매, 설비.
- 기타: 위 카테고리에 명확히 해당하지 않는 직무.

스펙 추출 지침:
- school: 학교명이 있으면 원문 그대로. 없으면 빈 문자열.
- major: 전공/학부/계열이 있으면 원문 그대로. 없으면 빈 문자열.
- gpa: "3.7/4.5", "학점 4.13", "3.6"처럼 학점만 간결히. 없으면 빈 문자열.
- languages: 토익, 토익스피킹, OPIC, 토플, JLPT, HSK 등 어학 성적/등급을 원문에 가깝게 배열로.
- certificates: 자격증/면허/기사/SQLD/ADsP/정보처리기사 등.
- internships: 인턴, 현장실습, 경력, 계약직, 산학 경험.
- activities: 프로젝트, 교육, 연구, 대외활동, 교내/사회/봉사, 해외연수/교환학생 등.
- awards: 수상/공모전/대회 입상.
- skills: 언어, 프레임워크, 툴, 직무 기술.
- summary: "학교 / 전공 / 학점 / 어학 / 인턴 / 활동 / 자격증" 형태의 한 줄 요약. 없는 항목은 생략.

target=${target}

응답 형식:
{
  "items": [
    {
      "id": "원본 id",
      "jobCategory": "IT" | "전자" | "영업" | "경영/기획" | "마케팅" | "인사/총무" | "재무/회계" | "생산/제조" | "기타",
      "confidence": 0부터 100 사이 숫자,
      "reason": "분류 근거 한 문장",
      "extractedSpec": {
        "school": "학교 또는 빈 문자열",
        "major": "전공 또는 빈 문자열",
        "gpa": "학점 또는 빈 문자열",
        "languages": ["어학"],
        "certificates": ["자격증"],
        "internships": ["인턴/경력"],
        "activities": ["활동/교육/프로젝트"],
        "awards": ["수상"],
        "skills": ["직무 관련 기술/도구"],
        "summary": "한 줄 스펙 요약"
      }
    }
  ]
}

입력:
${JSON.stringify(rows, null, 2)}
`.trim();
  }

  private parseResultJson(raw: string): CoverLetterJobAnalysis[] {
    const json = extractJson(raw);
    const parsed = JSON.parse(json) as
      | { items?: CoverLetterJobAnalysis[] }
      | CoverLetterJobAnalysis[];
    return Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  }
}
