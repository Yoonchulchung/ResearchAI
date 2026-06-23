import {
  CoverLetter,
  CoverLetterJobAnalysis,
  CoverLetterQuestion,
  JobCategory,
  JobCategoryTarget,
} from 'src/recruit/domain/cover-letter/cover-letter.model';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';
import { CoverLetterSpecAnalysisEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-spec-analysis.entity';
import { requestContext } from 'src/shared/request-context';
import {
  classifyQuestionTitle,
  extractQuestionKeywords as extractKeywordsBase,
  QUESTION_CATEGORIES,
} from 'src/recruit/application/question-classifier';

// ── Constants ─────────────────────────────────────────────────────────────────

export const DATA_DIR_NAME = 'cover-letters';
export const JSONL_FILENAME = 'cover-letters.jsonl';
export const SPEC_ANALYSIS_MAX_ITEMS = 20;
export const SPEC_ANALYSIS_TOKEN_BUDGET = 120_000;
export const SPEC_ANALYSIS_ANSWER_PREVIEW_CHARS = 550;

export const VALID_JOB_CATEGORIES: JobCategory[] = [
  'IT', '전자', '영업', '경영/기획', '마케팅', '인사/총무', '재무/회계', '생산/제조', '기타',
];

/** @deprecated question-classifier.ts 의 QUESTION_CATEGORIES 를 사용하세요 */
export const QUESTION_TAG_RULES: Array<{ tag: string; patterns: RegExp[] }> =
  QUESTION_CATEGORIES.map((c) => ({ tag: c.tag, patterns: [...c.titlePatterns] }));

// ── Company helpers ───────────────────────────────────────────────────────────

export function normalizeCompanyName(name: string): string {
  return name.replace(/[\s(주)㈜()（）㈔주식회사]/g, '').toLowerCase();
}

export function inferCompanyType(company: string): CoverLetter['companyType'] {
  const n = company.toLowerCase();
  if (/(금융|은행|뱅크|증권|보험|카드|캐피탈|자산운용|저축은행|신협|새마을금고|농협|수협|신한|국민|우리|하나|토스)/i.test(company)) {
    return '금융권';
  }
  if (/(삼성|현대|sk|lg|롯데|한화|포스코|cj|gs|ls|hd현대|신세계|kt|네이버|naver|카카오|kakao|쿠팡|대한항공|아모레|셀트리온|두산|효성)/i.test(n)) {
    return '대기업';
  }
  if (/(코리아|테크놀로지|솔루션|시스템즈|바이오|제약|산업|공업|건설|엔지니어링|푸드|미디어|커머스)/i.test(company)) {
    return '중견기업';
  }
  return '중소기업';
}

export function inferJobCategory(position: string): JobCategory {
  const p = position.toLowerCase().replace(/\s+/g, '');
  if (/반도체|semiconductor|회로|하드웨어|hw|임베디드|embedded|펌웨어|firmware|디스플레이|display|전기전자|전자공학|제어공학|rf[엔공]|fpga|pcb|vlsi|fab공정|웨이퍼|패키지공정|메모리설계|아날로그|시스템반도체|파운드리|eda|소자/.test(p)) {
    return '전자';
  }
  if (/백엔드|프론트엔드|풀스택|fullstack|앱개발|모바일개발|소프트웨어|software|개발자|sw엔지니어|웹개발|데이터엔지니어|데이터분析|데이터사이언|dataengineer|datascienc|ai[엔개]|머신러닝|machinelearn|딥러닝|deeplearn|클라우드|cloud|보안|security|인프라|infra|서버|server|네트워크|network|sre|devops|dba|qa|정보보안|정보기술|it[엔개서]|플랫폼|platform|si[개업]|사이버|cyber|blockchain|블록체인/.test(p)) {
    return 'IT';
  }
  if (/영업|세일즈|sales|거래처|b2b|b2c|고객관리|채널영업|솔루션영업|기술영업|대리점/.test(p)) return '영업';
  if (/마케팅|marketing|광고|홍보|pr[팀담]|브랜드|brand|sns|콘텐츠|content|퍼포먼스|디지털마케팅|crm|그로스/.test(p)) return '마케팅';
  if (/재무|회계|accounting|세무|tax|자금|원가|financial|audit|감사|fp&a|cfr|irm/.test(p)) return '재무/회계';
  if (/인사|hr[팀담]|채용|인재|조직문화|노무|총무|hrd|교육훈련/.test(p)) return '인사/총무';
  if (/생산관리|생산기술|품질관리|공정관리|scm|물류|구매|설비|manufacturing|공장|제조|qc[팀담]|qm/.test(p)) return '생산/제조';
  if (/기획|전략|경영|컨설팅|consulting|사업개발|bizdev|프로젝트매니저|pm[^a-z]|사업기획|신사업|전략기획/.test(p)) return '경영/기획';
  return '기타';
}

export function matchesTarget(category: string, target: JobCategoryTarget): boolean {
  if (target === 'all') return true;
  if (target === 'IT+전자') return category === 'IT' || category === '전자';
  return category === target;
}

// ── Text helpers ──────────────────────────────────────────────────────────────

export function normalizeSearchText(value?: string | null): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '');
}

export function parseJsonArray(value?: string | null): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function parseDate(value?: string | Date | null): Date {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

export function estimateTokens(text: string): number {
  let cjk = 0, ascii = 0, other = 0;
  for (const char of text) {
    if (/\s/.test(char)) continue;
    if (/[ㄱ-ㆎ가-힣぀-ヿ㐀-鿿]/.test(char)) cjk++;
    else if (char.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(cjk + other * 0.8 + ascii / 4);
}

export function getCatchCredentials(): { id: string; password: string } | undefined {
  const credentials = requestContext.getStore()?.serviceCredentials;
  if (!credentials?.catchId || !credentials.catchPassword) return undefined;
  return { id: credentials.catchId, password: credentials.catchPassword };
}

// ── Question tagging ──────────────────────────────────────────────────────────

/**
 * 문항 제목(question) 우선으로 태그를 추출합니다.
 * 제목에서 매칭 실패 시 답변(answer)을 fallback으로 사용합니다.
 */
export function classifyQuestionTags(
  question: Pick<CoverLetterQuestion, 'question' | 'answer'>,
): string[] {
  return classifyQuestionTitle(
    question.question ?? '',
    question.answer ?? '',
  );
}

export function extractQuestionKeywords(
  question: Pick<CoverLetterQuestion, 'question' | 'answer'>,
  tags: string[],
): string[] {
  return extractKeywordsBase(
    question.question ?? '',
    question.answer ?? '',
    tags,
  );
}

// ── Cover letter transformers ─────────────────────────────────────────────────

export function normalizeCoverLetterForView(item: CoverLetter): CoverLetter {
  return {
    ...item,
    source: item.source ?? (item.id.startsWith('catch-') ? 'catch' : 'linkareer'),
    companyType: item.companyType ?? inferCompanyType(item.company),
    jobCategory: item.jobCategory ?? inferJobCategory(item.position),
    questions: Array.isArray(item.questions) ? item.questions : [],
    collectedAt: item.collectedAt ?? new Date().toISOString(),
  };
}

export function buildSearchText(item: CoverLetter): string {
  return normalizeSearchText(
    [
      item.id, item.source, item.companyType, item.company, item.position,
      item.season, item.spec,
      ...item.questions.flatMap((q) => [q.question, q.answer]),
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function parseLegacyQuestions(value?: string | null): CoverLetterQuestion[] {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((question, index) => {
      const normalized: CoverLetterQuestion = {
        number: Number(question?.number) || index + 1,
        question: question?.question ?? '',
        answer: question?.answer ?? '',
      };
      const tags = classifyQuestionTags(normalized);
      return { ...normalized, tags, keywords: extractQuestionKeywords(normalized, tags) };
    });
  } catch {
    return [];
  }
}

export function toCoverLetter(entity: CoverLetterEntity, industry?: string | null): CoverLetter {
  const relationQuestions = (entity.questionItems ?? [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((q): CoverLetterQuestion => ({
      number: q.number,
      question: q.question,
      answer: q.answer,
      keywords: parseJsonArray(q.keywords),
      tags: parseJsonArray(q.tags),
    }));
  const questions =
    relationQuestions.length > 0 ? relationQuestions : parseLegacyQuestions(entity.questions);

  return normalizeCoverLetterForView({
    id: entity.id,
    url: entity.url,
    source: entity.source as CoverLetter['source'],
    companyType: entity.companyType ?? undefined,
    jobCategory: (entity.jobCategory as JobCategory) ?? undefined,
    company: entity.company,
    position: entity.position,
    season: entity.season,
    spec: entity.spec,
    viewCount: entity.viewCount ?? undefined,
    isHidden: entity.isHidden,
    questions,
    collectedAt: entity.collectedAt.toISOString(),
    industry: industry ?? null,
  });
}

// ── Spec analysis helpers ─────────────────────────────────────────────────────

export function normalizeJobAnalysis(item: CoverLetterJobAnalysis): CoverLetterJobAnalysis {
  const category: JobCategory = VALID_JOB_CATEGORIES.includes(item.jobCategory)
    ? item.jobCategory
    : '기타';
  const spec = item.extractedSpec ?? { summary: '' };
  return {
    id: item.id,
    jobCategory: category,
    confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)),
    reason: item.reason || '',
    extractedSpec: {
      school: spec.school || '',
      major: spec.major || '',
      gpa: spec.gpa || '',
      languages: Array.isArray(spec.languages) ? spec.languages : [],
      certificates: Array.isArray(spec.certificates) ? spec.certificates : [],
      internships: Array.isArray(spec.internships) ? spec.internships : [],
      activities: Array.isArray(spec.activities) ? spec.activities : [],
      awards: Array.isArray(spec.awards) ? spec.awards : [],
      skills: Array.isArray(spec.skills) ? spec.skills : [],
      summary: spec.summary || '',
    },
  };
}

export function entityToJobAnalysis(row: CoverLetterSpecAnalysisEntity): CoverLetterJobAnalysis {
  let extractedSpec: CoverLetterJobAnalysis['extractedSpec'];
  if ((row.school !== undefined && row.school !== null) || (row.specSummary !== undefined && row.specSummary !== null)) {
    extractedSpec = {
      school: row.school || '',
      major: row.major || '',
      gpa: row.gpa || '',
      languages: parseJsonArray(row.languages),
      certificates: parseJsonArray(row.certificates),
      internships: parseJsonArray(row.internships),
      activities: parseJsonArray(row.activities),
      awards: parseJsonArray(row.awards),
      skills: parseJsonArray(row.skills),
      summary: row.specSummary || '',
    };
  } else {
    extractedSpec = { summary: '' };
    try {
      const parsed = JSON.parse(row.extractedSpec || '{}');
      extractedSpec = {
        school: parsed.school || '',
        major: parsed.major || '',
        gpa: parsed.gpa || '',
        languages: Array.isArray(parsed.languages) ? parsed.languages : [],
        certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [],
        internships: Array.isArray(parsed.internships) ? parsed.internships : [],
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        awards: Array.isArray(parsed.awards) ? parsed.awards : [],
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        summary: parsed.summary || '',
      };
    } catch { /* ignore */ }
  }
  return {
    id: row.coverLetterId,
    jobCategory: row.jobCategory as CoverLetterJobAnalysis['jobCategory'],
    confidence: Math.round(row.confidence * 100),
    reason: row.reason ?? '',
    extractedSpec,
  };
}
