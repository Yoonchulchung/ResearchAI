import { load } from 'cheerio';
import { CoverLetter, CoverLetterQuestion } from '../domain/cover-letter.model';

const BASE_URL = 'https://linkareer.com';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Referer: 'https://linkareer.com/cover-letter/search',
};

export class LinkareerCrawler {
  private async fetchHtml(url: string, timeoutMs = 15_000): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
      return res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /** 목록 페이지에서 자소서 ID 목록 추출. 빈 배열이면 마지막 페이지 */
  async getIdsFromPage(
    page: number,
    opts: { company?: string; role?: string; keyword?: string } = {},
  ): Promise<string[]> {
    const url = new URL(`${BASE_URL}/cover-letter/search`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'PASSED_AT');
    url.searchParams.set('tab', 'all');
    if (opts.company) url.searchParams.set('organizationName', opts.company);
    if (opts.role) url.searchParams.set('role', opts.role);
    if (opts.keyword) url.searchParams.set('keyword', opts.keyword);

    const html = await this.fetchHtml(url.toString());
    const $ = load(html);

    // __NEXT_DATA__ 에서 구조화된 ID 추출 시도
    const nextDataText = $('script#__NEXT_DATA__').html();
    if (nextDataText) {
      try {
        const data = JSON.parse(nextDataText);
        const ids = this.extractIdsFromNextData(data);
        if (ids.length > 0) return ids;
      } catch {
        // fall through to HTML parsing
      }
    }

    // fallback: href="/cover-letter/{숫자}" 링크 추출
    const ids = new Set<string>();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/^\/cover-letter\/(\d+)/);
      if (m) ids.add(m[1]);
    });
    return [...ids];
  }

  /** 자소서 상세 페이지 파싱 */
  async getDetail(id: string): Promise<CoverLetter | null> {
    const url = `${BASE_URL}/cover-letter/${id}`;
    let html: string;
    try {
      html = await this.fetchHtml(url);
    } catch {
      return null;
    }

    const $ = load(html);

    // __NEXT_DATA__ 시도
    const nextDataText = $('script#__NEXT_DATA__').html();
    if (nextDataText) {
      try {
        const data = JSON.parse(nextDataText);
        const fromNext = this.parseFromNextData(data, id, url);
        if (fromNext) return fromNext;
      } catch {
        // fall through
      }
    }

    // HTML 직접 파싱
    const basicInfo = $('h1.basic-info').text().trim();
    if (!basicInfo) return null;

    const parts = basicInfo.split('/').map((s) => s.trim());
    const company = parts[0] ?? '';
    const position = parts[1] ?? '';
    const season = parts[2] ?? '';
    const spec = $('h3.spec-info').text().trim();

    const articleHtml = $('article').first().html() ?? '';
    const questions = this.parseQuestions(articleHtml);

    if (!company && !articleHtml) return null;

    return {
      id,
      url,
      company,
      position,
      season,
      spec,
      questions,
      collectedAt: new Date().toISOString(),
    };
  }

  // ────────────────────────────────────────────────
  // private helpers
  // ────────────────────────────────────────────────

  private extractIdsFromNextData(data: unknown): string[] {
    // 실제 JSON 구조에 따라 경로가 다를 수 있음 — 알려진 패턴 순차 시도
    const candidates = [
      (d: any) => d?.props?.pageProps?.coverLetters?.edges,
      (d: any) => d?.props?.pageProps?.data?.coverLetters?.edges,
      (d: any) => d?.props?.pageProps?.coverLetterList?.edges,
    ];
    for (const fn of candidates) {
      const edges = fn(data);
      if (Array.isArray(edges) && edges.length > 0) {
        return edges
          .map((e: any) => String(e?.node?.id ?? e?.id ?? ''))
          .filter(Boolean);
      }
    }
    return [];
  }

  private parseFromNextData(
    data: unknown,
    id: string,
    url: string,
  ): CoverLetter | null {
    const candidates = [
      (d: any) => d?.props?.pageProps?.coverLetter,
      (d: any) => d?.props?.pageProps?.data?.coverLetter,
    ];
    for (const fn of candidates) {
      const cl = fn(data);
      if (!cl) continue;
      const questions: CoverLetterQuestion[] = (cl.questions ?? cl.items ?? []).map(
        (q: any, i: number) => ({
          number: q.number ?? q.order ?? i + 1,
          question: q.question ?? q.title ?? q.item ?? '',
          answer: q.answer ?? q.content ?? '',
        }),
      );
      if (questions.length === 0) continue;
      return {
        id,
        url,
        company: cl.organization?.name ?? cl.companyName ?? cl.company ?? '',
        position: cl.role ?? cl.position ?? cl.job ?? '',
        season: cl.season ?? cl.appliedAt ?? cl.year ?? '',
        spec: [
          cl.university ?? '',
          cl.major ?? '',
          cl.gpa ? `학점 ${cl.gpa}` : '',
        ]
          .filter(Boolean)
          .join(' / '),
        questions,
        collectedAt: new Date().toISOString(),
      };
    }
    return null;
  }

  /** article 내 질문/답변 텍스트 파싱 */
  private parseQuestions(articleHtml: string): CoverLetterQuestion[] {
    const $ = load(articleHtml, null, false);
    // selection-popover 같은 UI 요소 제거
    $('#selection-popover, .SelectionPopover__StyledRoot-sc-5683a4c1-0').remove();
    const text = $.text();

    // "N. 질문\n 답변" 패턴으로 분할
    // 줄 시작 숫자 + 마침표 패턴
    const segments = text.split(/(?:^|\n)\s*(\d{1,2})\.\s+/m);
    // segments: [ intro, '1', 'Q1\n A1...', '2', 'Q2\n A2...', ... ]

    const questions: CoverLetterQuestion[] = [];
    for (let i = 1; i < segments.length - 1; i += 2) {
      const num = parseInt(segments[i], 10);
      const body = segments[i + 1]?.trim() ?? '';
      if (!body) continue;

      const newlineIdx = body.indexOf('\n');
      const question =
        newlineIdx > 0 ? body.slice(0, newlineIdx).trim() : body;
      const answer =
        newlineIdx > 0
          ? body
              .slice(newlineIdx)
              .replace(/^\s+/gm, '')  // 줄 앞 공백 제거
              .trim()
          : '';

      if (question) questions.push({ number: num, question, answer });
    }
    return questions;
  }
}
