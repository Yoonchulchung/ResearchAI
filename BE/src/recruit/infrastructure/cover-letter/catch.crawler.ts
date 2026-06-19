import {
  CoverLetter,
  CoverLetterQuestion,
} from 'src/recruit/domain/cover-letter/cover-letter.model';
import { CatchAuthService } from 'src/browse/infrastructure/auth/catch-auth.service';

const BASE_URL = 'https://www.catch.co.kr';
const LIST_API_URL = `${BASE_URL}/api/v1.0/jobn/coverLetter/main/getCvletterList`;
const DETAIL_API_URL = `${BASE_URL}/api/v1.0/jobn/coverLetter/main/getPassCvletter`;
const SPEC_API_URL = `${BASE_URL}/api/v1.0/jobn/coverLetter/main/getPassSpec`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE_URL}/JobN/CoverLetter/Main`,
  'x-is-pc': 'true',
};

interface CatchAuthCredentials {
  id: string;
  password: string;
}

interface CatchCoverLetterListItem {
  PassID: number;
  CompID: string;
  CompName: string;
  JobName: string;
  JobDetailName: string;
  Year: number;
  Term: string;
  PassCoverLetterID: number;
  ViewCnt: number;
  Contents: string;
}

interface CatchCoverLetterDetailItem {
  pIdx: number;
  CoverLetterID: number;
  Subject: string;
  Contents: string;
  TotalCount?: number;
  AppealList?: Array<{ Name?: string }>;
}

interface CatchCoverLetterSpec {
  PassID?: number;
  CI?: string;
  CompName?: string;
  CompID?: string;
  RecruitJobCode?: string;
  Year?: number;
  Term?: string;
  본사주소Ko?: string;
  RecruitGubun?: string;
  Depth1?: string;
  Depth2?: string;
  SchoolName?: string;
  MajorName?: string;
  Credit?: string;
  MaxCredit?: string;
  LangTest?: number;
  License?: number;
  Award?: number;
  Activity?: number;
  Career?: number;
  CntApplyDocument?: number;
  CntPassDocument?: number;
  CntPassFinal?: number;
  Content?: string;
  HomePageUrl?: string;
}

export class CatchCoverLetterCrawler {
  private summaries = new Map<string, CatchCoverLetterListItem>();
  private authHeaders: Record<string, string> | null = null;

  constructor(private readonly catchAuth: CatchAuthService) {}

  async getIdsFromPage(
    page: number,
    opts: {
      company?: string;
      role?: string;
      keyword?: string;
      auth?: CatchAuthCredentials;
    } = {},
  ): Promise<string[]> {
    const params = new URLSearchParams({
      jobCode: '',
      year: '',
      term: '',
      keyword: opts.keyword || opts.company || opts.role || '',
      curPage: String(page),
      pageSize: '5',
    });

    const data = await this.fetchJson<{ list?: CatchCoverLetterListItem[] }>(
      `${LIST_API_URL}?${params}`,
      opts.auth,
    );
    const list = data.list ?? [];
    for (const item of list) {
      this.summaries.set(String(item.PassCoverLetterID), item);
    }

    return list.map((item) => `catch-${item.PassCoverLetterID}`);
  }

  async getDetail(
    id: string,
    opts: { auth?: CatchAuthCredentials } = {},
  ): Promise<CoverLetter | null> {
    const coverLetterId = id.replace(/^catch-/, '');
    const summary = this.summaries.get(coverLetterId);
    const [questions, spec] = await Promise.all([
      this.getQuestions(coverLetterId, opts.auth),
      this.getSpec(coverLetterId, opts.auth).catch(() => null),
    ]);

    if (!summary && questions.length === 0) return null;

    return {
      id: `catch-${coverLetterId}`,
      url: `${BASE_URL}/JobN/CoverLetter/Main`,
      source: 'catch',
      company: spec?.CompName ?? summary?.CompName ?? '',
      companyType: this.inferCompanyType(
        spec?.CompName ?? summary?.CompName ?? '',
      ),
      position: [
        spec?.RecruitGubun,
        spec?.Depth1 ?? summary?.JobName,
        spec?.Depth2 ?? summary?.JobDetailName,
      ]
        .filter(Boolean)
        .join(' / '),
      season: [spec?.Year ?? summary?.Year, spec?.Term ?? summary?.Term]
        .filter(Boolean)
        .join(' '),
      spec: this.formatSpec(spec, summary),
      viewCount: summary?.ViewCnt,
      questions,
      collectedAt: new Date().toISOString(),
    };
  }

  private async getQuestions(
    coverLetterId: string,
    auth?: CatchAuthCredentials,
  ): Promise<CoverLetterQuestion[]> {
    const pageSize = 20;
    const questions: CoverLetterQuestion[] = [];
    let totalCount = Number.MAX_SAFE_INTEGER;
    let page = 1;

    while (questions.length < totalCount && page <= 20) {
      const params = new URLSearchParams({
        curPage: String(page),
        pageSize: String(pageSize),
      });
      const data = await this.fetchJson<{
        cvletterList?: CatchCoverLetterDetailItem[];
      }>(`${DETAIL_API_URL}/${coverLetterId}?${params}`, auth);
      const list = data.cvletterList ?? [];
      if (list.length === 0) break;

      totalCount = list[0]?.TotalCount ?? list.length;
      for (const item of list) {
        questions.push({
          number: questions.length + 1,
          question: item.Subject ?? '',
          answer: item.Contents ?? '',
        });
      }
      page++;
    }

    return questions;
  }

  private async getSpec(
    coverLetterId: string,
    auth?: CatchAuthCredentials,
  ): Promise<CatchCoverLetterSpec | null> {
    return this.fetchJson<CatchCoverLetterSpec>(
      `${SPEC_API_URL}/${coverLetterId}`,
      auth,
    );
  }

  private formatSpec(
    spec: CatchCoverLetterSpec | null,
    summary?: CatchCoverLetterListItem,
  ): string {
    const parts = [
      [spec?.SchoolName, spec?.MajorName].filter(Boolean).join(' '),
      spec?.Credit && spec?.MaxCredit
        ? `학점 ${spec.Credit}/${spec.MaxCredit}`
        : '',
      spec?.LangTest != null ? `어학 ${spec.LangTest}` : '',
      spec?.License != null ? `자격증 ${spec.License}` : '',
      spec?.Award != null ? `수상 ${spec.Award}` : '',
      spec?.Activity != null ? `활동 ${spec.Activity}` : '',
      spec?.Career != null ? `경력 ${spec.Career}` : '',
      spec?.CntPassFinal != null ? `최종합격 ${spec.CntPassFinal}` : '',
      summary?.ViewCnt
        ? `조회 ${summary.ViewCnt.toLocaleString('ko-KR')}회`
        : '',
    ].filter(Boolean);

    return parts.join(' · ');
  }

  private inferCompanyType(company: string): CoverLetter['companyType'] {
    const normalized = company.toLowerCase();
    if (
      /(금융|은행|뱅크|증권|보험|카드|캐피탈|자산운용|저축은행|신협|새마을금고|농협|수협|신한|국민|우리|하나|토스)/i.test(
        company,
      )
    ) {
      return '금융권';
    }
    if (
      /(삼성|현대|sk|lg|롯데|한화|포스코|cj|gs|ls|hd현대|신세계|kt|네이버|naver|카카오|kakao|쿠팡|대한항공|아모레|셀트리온|두산|효성)/i.test(
        normalized,
      )
    ) {
      return '대기업';
    }
    if (
      /(코리아|테크놀로지|솔루션|시스템즈|바이오|제약|산업|공업|건설|엔지니어링|푸드|미디어|커머스)/i.test(
        company,
      )
    ) {
      return '중견기업';
    }
    return '중소기업';
  }

  private async fetchJson<T>(
    url: string,
    auth?: CatchAuthCredentials,
  ): Promise<T> {
    const headers = {
      ...HEADERS,
      ...(await this.getAuthHeaders(auth)),
    };
    const res = await fetch(url, { headers });
    if (
      (res.status === 401 || res.status === 403) &&
      auth &&
      this.authHeaders
    ) {
      this.authHeaders = null;
      const retryHeaders = {
        ...HEADERS,
        ...(await this.getAuthHeaders(auth)),
      };
      const retry = await fetch(url, { headers: retryHeaders });
      if (!retry.ok) {
        throw new Error(`Catch 자소서 API HTTP ${retry.status}`);
      }
      return retry.json() as Promise<T>;
    }
    if (!res.ok) {
      throw new Error(`Catch 자소서 API HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  private async getAuthHeaders(
    auth?: CatchAuthCredentials,
  ): Promise<Record<string, string>> {
    if (!auth) return {};
    if (this.authHeaders) return this.authHeaders;

    const result = await this.catchAuth.getAuthenticatedHeaders(
      auth.id,
      auth.password,
    );
    this.authHeaders = result.headers;
    return this.authHeaders;
  }
}
