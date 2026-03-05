import { load } from 'cheerio';
import { randomUUID } from 'crypto';
import { JobPosting } from '../../domain/job-posting.model';
import { CollectQuery, JobSource } from '../../domain/job-source.interface';

const BASE_URL = 'https://www.saramin.co.kr';
const DELAY_MS = 1000;

/** 사람인 emp_tp 코드 매핑 */
const EMP_TYPE_MAP: Record<string, string> = {
  '대기업':   '1',
  '중견기업':  '2',
  '중소기업':  '3',
  '외국계':   '4',
  '외국계기업': '4',
  '공기업':   '5',
  '공공기관':  '5',
  '스타트업':  '6',
  '벤처':    '6',
};

/**
 * 사람인 career_cd 매핑 (경력 구분)
 * 신입=1, 경력=2, 인턴은 job_type=3 으로 별도 처리
 */
const CAREER_CD_MAP: Record<string, string> = {
  '신입': '1',
  '경력': '2',
};

/** 사람인 job_type 매핑 (고용 형태) — 인턴십=3 */
const JOB_TYPE_MAP: Record<string, string> = {
  '인턴': '3',
};

export class SaraminCrawler implements JobSource {
  readonly name = 'saramin';
  readonly type = 'crawler' as const;

  isAvailable(): boolean {
    return true;
  }

  async *collect(query: CollectQuery): AsyncGenerator<JobPosting> {
    const limit = query.limit ?? 40;
    let collected = 0;
    let page = 1;

    while (collected < limit) {
      const url = new URL(`${BASE_URL}/zf_user/search/recruit`);
      url.searchParams.set('searchword', query.keyword);
      url.searchParams.set('recruitPage', String(page));
      url.searchParams.set('recruitPageCount', '40');
      if (query.location) url.searchParams.set('loc_mcd', query.location);
      for (const ct of query.companyTypes ?? []) {
        const empTp = EMP_TYPE_MAP[ct];
        if (empTp) url.searchParams.append('emp_tp', empTp);
      }
      for (const jt of query.jobTypes ?? []) {
        const careerCd = CAREER_CD_MAP[jt];
        if (careerCd) url.searchParams.append('career_cd', careerCd);
        const jobType = JOB_TYPE_MAP[jt];
        if (jobType) url.searchParams.append('job_type', jobType);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let html: string;
      try {
        const res = await fetch(url.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
      } catch (e) {
        const name = (e as Error).name;
        throw new Error(name === 'AbortError' ? '요청 시간 초과 (10s)' : String(e));
      } finally {
        clearTimeout(timer);
      }

      const $ = load(html);
      const items = $('.item_recruit');
      if (items.length === 0) break;

      for (const el of items.toArray()) {
        if (collected >= limit) break;

        const titleEl = $(el).find('.job_tit a');
        const title = titleEl.text().trim();
        const href = titleEl.attr('href') ?? '';

        const company = $(el).find('.corp_name a').first().text().trim();
        const conditions = $(el).find('.job_condition span').map((_, s) => $(s).text().trim()).get();
        const location = conditions[0] ?? '';

        const sectorTags = $(el).find('.job_sector span')
          .map((_, s) => $(s).text().trim())
          .get()
          .filter(Boolean);

        const postedText = $(el).find('.job_date .date').text().trim();

        if (!title || !company || !href) continue;

        const jobUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        const recIdx = new URL(jobUrl).searchParams.get('rec_idx') ?? randomUUID();

        yield {
          id: `saramin-${recIdx}`,
          source: 'saramin',
          sourceType: 'crawler',
          title,
          company,
          location,
          description: conditions.slice(1).join(' | '),
          skills: sectorTags,
          url: jobUrl,
          postedAt: postedText || null,
          collectedAt: new Date().toISOString(),
        };

        collected++;
      }

      if (items.length < 40) break;
      page++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
}
