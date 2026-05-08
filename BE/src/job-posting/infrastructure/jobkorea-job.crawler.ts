import { load } from 'cheerio';
import type { JobPosting } from '../domain/job-posting.model';
import { normalizeJobType } from './job-type.util';

const BASE_URL = 'https://www.jobkorea.co.kr';

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Connection: 'keep-alive',
};

export class JobkoreaJobCrawler {
  private async postHtml(
    path: string,
    body: URLSearchParams,
    timeoutMs = 15_000,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          ...COMMON_HEADERS,
          Accept: 'text/html, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: BASE_URL,
          Referer: `${BASE_URL}/recruit/joblist?menucode=local&localorder=1`,
        },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
      return res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async getPostingsFromPage(page: number): Promise<JobPosting[]> {
    const body = new URLSearchParams({
      page: String(page),
      'condition[menucode]': 'direct',
      local: '0',
      order: '20',
      pagesize: '40',
      tabindex: '0',
      onePick: '0',
      confirm: '0',
      profile: '0',
    });

    console.log(`[JobKorea] POST _GI_List page=${page}`);
    const html = await this.postHtml('/Recruit/Home/_GI_List/', body);
    const $ = load(html);

    const postings: JobPosting[] = [];

    $('tr.devloopArea[data-gno]').each((_, row) => {
      const gno = $(row).attr('data-gno') ?? '';
      if (!gno) return;

      const id = `jk-${gno}`;
      const company = $(row).find('td.tplCo a.normalLog').first().text().trim();
      const titleEl = $(row).find('td.tplTit div.titBx strong a').first();
      const title = titleEl.attr('title') || titleEl.text().trim();

      // p.etc span.cell 순서: 경력, 학력, 지역, 고용형태, 급여
      const cells = $(row)
        .find('td.tplTit p.etc span.cell')
        .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
        .get();
      const career = cells[0] ?? '';
      const location = cells[2] ?? '';
      const salary = cells[4] ?? '';

      const category = $(row).find('td.tplTit p.dsc').text().replace(/\s+/g, ' ').trim();

      // span.date: "~05/31(일)" 형태
      const deadline = $(row).find('td.odd span.date').text().replace(/\s+/g, '').trim();

      const type = normalizeJobType(career);

      if (!title && !company) return;

      postings.push({
        id,
        url: `${BASE_URL}/Recruit/GI_Read/${gno}`,
        company,
        title,
        type,
        location,
        deadline,
        category,
        viewCount: 0,
        collectedAt: new Date().toISOString(),
        source: 'jobkorea',
        ...(salary ? { jobs: salary } : {}),
      });
    });

    return postings;
  }
}
