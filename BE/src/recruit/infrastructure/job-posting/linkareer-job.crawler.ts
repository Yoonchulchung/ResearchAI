import { load } from 'cheerio';
import type { JobPosting } from '../../domain/job-posting.model';
import { normalizeJobType } from './job-type.util';

const BASE_URL = 'https://linkareer.com';
const GQL_URL = 'https://api.linkareer.com/graphql';

// Persisted query hash for RecruitList operation
const RECRUIT_LIST_HASH = 'c49dc332ee92bdac9ed8efc415dc82822984240ff4ba1421245c54fb7c4b14e3';

const GQL_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Referer: 'https://linkareer.com/list/intern',
};

const HTML_HEADERS = {
  ...GQL_HEADERS,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export class LinkareerJobCrawler {
  /** GraphQL API로 목록 조회 */
  async getPostingsFromPage(
    page: number,
    opts: { jobType?: 'INTERN' | 'RECRUIT'; status?: 'OPEN' | 'ALL' } = {},
  ): Promise<JobPosting[]> {
    const isIntern = (opts.jobType ?? 'INTERN') === 'INTERN';
    const variables = {
      filterBy: {
        status: opts.status === 'ALL' ? null : 'OPEN',
        activityTypeID: '5',
        regionIDs: [],
        ...(isIntern ? { internTypeIds: [], jobTypes: ['INTERN'] } : {}),
        categoryIDs: [],
        simpleApplyFilter: null,
      },
      activityOrder: { field: 'RECENT', direction: 'DESC' },
      page,
      pageSize: 20,
    };

    const params = new URLSearchParams({
      operationName: 'RecruitList',
      variables: JSON.stringify(variables),
      extensions: JSON.stringify({
        persistedQuery: { version: 1, sha256Hash: RECRUIT_LIST_HASH },
      }),
    });

    const res = await fetch(`${GQL_URL}?${params}`, { headers: GQL_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const nodes: any[] = json?.data?.activities?.nodes ?? [];

    return nodes.map((node) => {
      const deadline = node.recruitCloseAt
        ? new Date(node.recruitCloseAt).toLocaleDateString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          }).replace(/\. /g, '.').replace(/\.$/, '')
        : '';

      const location = (node.regions as any[] ?? [])
        .map((r: any) => r.name)
        .join(', ')
        || (node.addresses as any[] ?? [])
          .map((a: any) => a.sido)
          .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
          .join(', ');

      const category = (node.categories as any[] ?? [])
        .map((c: any) => c.name)
        .join(', ');

      const rawType =
        node.recruitInformations?.[0]?.internTypes?.[0]?.name ??
        node.jobTypes?.[0] ?? '';

      return {
        id: String(node.id),
        url: `${BASE_URL}/activity/${node.id}`,
        company: node.organizationName ?? '',
        title: (node.title ?? '').trim(),
        type: normalizeJobType(rawType),
        location,
        deadline,
        category,
        viewCount: node.viewCount ?? 0,
        collectedAt: new Date().toISOString(),
        source: 'linkareer' as const,
      } satisfies JobPosting;
    });
  }

  /** 상세 페이지에서 기업형태, 모집직무, 상세내용 파싱 */
  async getDetail(id: string): Promise<Partial<JobPosting>> {
    const url = `${BASE_URL}/activity/${id}`;
    let html: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, { headers: HTML_HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return {};
      html = await res.text();
    } catch {
      return {};
    }

    const $ = load(html);

    let companyType: string | undefined;
    let jobs: string | undefined;
    let detailHtml: string | undefined;

    // __NEXT_DATA__에서 기업형태·모집직무 추출
    const nextDataText = $('script#__NEXT_DATA__').html();
    if (nextDataText) {
      try {
        const data = JSON.parse(nextDataText);
        const candidates = [
          (d: any) => d?.props?.pageProps?.activity,
          (d: any) => d?.props?.pageProps?.data?.activity,
        ];
        for (const fn of candidates) {
          const a = fn(data);
          if (!a) continue;
          companyType = a.organizationType ?? a.companyType ?? undefined;
          jobs = (a.jobs ?? []).map((j: any) => j?.name ?? '').filter(Boolean).join(', ') || undefined;
          break;
        }
      } catch { /* fall through */ }
    }

    // HTML 직접 파싱 — 기업형태·모집직무 보완
    if (!companyType || !jobs) {
      $('.field-label').each((_, dt) => {
        const label = $(dt).text().trim();
        const value = $(dt).next('dd').text().replace(/\s+/g, ' ').trim();
        if (label === '기업형태' && !companyType) companyType = value || undefined;
        if (label === '모집직무' && !jobs)        jobs        = value || undefined;
      });
    }

    // 상세 내용: article#DETAIL .responsive-element HTML 추출
    const contentEl = $('article#DETAIL .responsive-element').first();
    if (contentEl.length) {
      contentEl.find('script, style, noscript').remove();
      // 외부 링크 이미지는 src 유지, data-src → src 폴백
      contentEl.find('img').each((_, img) => {
        const $img = $(img);
        const dataSrc = $img.attr('data-src');
        if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
      });
      const raw = contentEl.html() ?? '';
      if (raw.trim()) detailHtml = raw.trim();
    }

    return { companyType, jobs, detailHtml };
  }
}
