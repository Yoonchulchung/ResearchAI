import type { Page } from 'puppeteer';

export interface ExtractedJob {
  title: string;
  company: string;
  deadline: string;
  type: string;
  url: string;
  source: string;
}

const SETTLE_MS = 2_500;

function settle(ms = SETTLE_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 링커리어 ─────────────────────────────────────────────────────────────────

export async function scrapeLinkareer(page: Page, keyword: string): Promise<ExtractedJob[]> {
  // tab=activity 포함 → 마감된 공고도 수집
  const url = `https://linkareer.com/search?q=${encodeURIComponent(keyword)}&sort=RELEVANCE&tab=activity&page=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle();

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];
    const seen = new Set<string>();

    const cards = Array.from(document.querySelectorAll<HTMLElement>('li, article'));
    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/activity/"]');
      if (!link) continue;
      const href = link.href || ('https://linkareer.com' + (link.getAttribute('href') ?? ''));
      if (!href.includes('/activity/') || seen.has(href)) continue;
      seen.add(href);

      const titleCandidates = Array.from(card.querySelectorAll<HTMLElement>(
        '[class*="title"], [class*="Title"], h2, h3, strong',
      )).map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter((t) => t.length > 3);
      const title = titleCandidates[0] ?? (link.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!title) continue;

      const allText = Array.from(card.querySelectorAll<HTMLElement>('p, span, div'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter((t) => t && t !== title && t.length > 1 && t.length < 80);
      const company = allText.find((t) => !t.match(/^\d/) && !t.includes('D-') && !t.includes('~')) ?? '';

      const cardText = card.textContent ?? '';
      const dl = cardText.match(/~\s*\d+\.\d+|\d{4}[./]\d{2}[./]\d{2}|D-\d+|상시모집/)?.[0] ?? '';

      const typeMatch = cardText.match(/신입|경력|인턴|정규직|계약직|아르바이트/);
      results.push({ title, company, deadline: dl, type: typeMatch?.[0] ?? '', url: href, source: 'linkareer' });
    }
    return results;
  }) as Promise<ExtractedJob[]>;
}

export async function extractLinkareerDetail(page: Page, url: string): Promise<ExtractedJob | null> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(1_500);
  return page.evaluate((src: string) => {
    // __NEXT_DATA__ 우선
    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl?.textContent) {
      try {
        const data = JSON.parse(nextEl.textContent) as Record<string, unknown>;
        const str = JSON.stringify(data);
        const titleM = str.match(/"title"\s*:\s*"([^"\\]{3,}(?:\\.[^"\\]*)*)"/);
        const orgM = str.match(/"organizationName"\s*:\s*"([^"\\]+)"/);
        if (titleM?.[1]) {
          return {
            title: titleM[1],
            company: orgM?.[1] ?? '',
            deadline: '',
            type: '',
            url: src,
            source: 'linkareer',
          } satisfies { title: string; company: string; deadline: string; type: string; url: string; source: string };
        }
      } catch { /* ignore */ }
    }
    // DOM fallback
    const og = (sel: string) =>
      document.querySelector<HTMLMetaElement>(sel)?.getAttribute('content')?.trim() ?? '';
    const title = og('meta[property="og:title"]') || document.title;
    const company = document.querySelector('[class*="organization"], [class*="company"]')?.textContent?.trim() ?? '';
    return title ? { title, company, deadline: '', type: '', url: src, source: 'linkareer' } : null;
  }, url) as Promise<ExtractedJob | null>;
}

// ── 잡코리아 ─────────────────────────────────────────────────────────────────

export async function scrapeJobkorea(page: Page, keyword: string): Promise<ExtractedJob[]> {
  const url = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(keyword)}&tabType=recruit`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle();

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];
    const seen = new Set<string>();

    const selectors = [
      '.list-default .post-list-corp',
      '.recruit-list .list-post li',
      '#gidListWrap .list-item',
      'tr.devloopArea[data-gno]',
    ];
    const items: HTMLElement[] = [];
    for (const sel of selectors) {
      items.push(...Array.from(document.querySelectorAll<HTMLElement>(sel)));
    }

    for (const item of items) {
      const link = item.querySelector<HTMLAnchorElement>(
        'a.title, a[href*="GI_Read"], a[href*="/recruit/"]',
      );
      if (!link) continue;
      const href = link.href || ('https://www.jobkorea.co.kr' + (link.getAttribute('href') ?? ''));
      if (seen.has(href)) continue;
      seen.add(href);

      const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) continue;

      const company = (
        item.querySelector('a.corp-name, .company-name, .cpname, [class*="corpName"]')?.textContent ?? ''
      ).replace(/\s+/g, ' ').trim();

      const metas = Array.from(item.querySelectorAll('.chip, .etc, .info span, .post-list-info li'))
        .map((el) => el.textContent?.trim() ?? '').filter(Boolean);
      const typeMatch = metas.find((m) => /신입|경력|인턴/.test(m));
      const deadline = (item.querySelector('.date, .deadline, [class*="date"]')?.textContent ?? '').trim();

      results.push({ title, company, deadline, type: typeMatch ?? '', url: href, source: 'jobkorea' });
    }
    return results;
  }) as Promise<ExtractedJob[]>;
}

export async function extractJobkoreaDetail(page: Page, url: string): Promise<ExtractedJob | null> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(1_500);
  return page.evaluate((src: string) => {
    const title = (
      document.querySelector<HTMLElement>('.titleArea .title, .jv-title h1, h1.title')?.textContent ??
      document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.getAttribute('content') ??
      document.title
    ).replace(/\s+/g, ' ').trim();
    const company = (
      document.querySelector<HTMLElement>('a.corpName, .corp-name, [class*="companyName"]')?.textContent ?? ''
    ).replace(/\s+/g, ' ').trim();
    const deadline = (document.querySelector<HTMLElement>('[class*="deadLine"], .dday, .deadline')?.textContent ?? '').trim();
    return title ? { title, company, deadline, type: '', url: src, source: 'jobkorea' } : null;
  }, url) as Promise<ExtractedJob | null>;
}

// ── 사람인 ───────────────────────────────────────────────────────────────────

export async function scrapeSaramin(page: Page, keyword: string): Promise<ExtractedJob[]> {
  const url = `https://www.saramin.co.kr/zf_user/search?searchword=${encodeURIComponent(keyword)}&recruitPage=1&recruitPageCount=40`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(2_000);

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];
    const seen = new Set<string>();

    const items = Array.from(document.querySelectorAll<HTMLElement>('.item_recruit, .list_item'));
    for (const item of items) {
      const titleEl = item.querySelector<HTMLAnchorElement>('.job_tit a, .tit a');
      if (!titleEl) continue;
      const href = titleEl.href || ('https://www.saramin.co.kr' + (titleEl.getAttribute('href') ?? ''));
      if (seen.has(href)) continue;
      seen.add(href);

      const title = (titleEl.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!title) continue;

      const company = (item.querySelector('.corp_name a, .company a')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const deadline = (item.querySelector('.job_date .date, .deadline')?.textContent ?? '').trim();
      const cond = Array.from(item.querySelectorAll('.job_condition span, .condition span'))
        .map((el) => el.textContent?.trim() ?? '').join(', ');

      results.push({ title, company, deadline, type: cond, url: href, source: 'saramin' });
    }
    return results;
  }) as Promise<ExtractedJob[]>;
}

// ── 캐치 (JSON API) ──────────────────────────────────────────────────────────

const CATCH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export async function scrapeCatch(keyword: string): Promise<ExtractedJob[]> {
  try {
    const params = new URLSearchParams({
      Keyword: keyword,
      Sort: '0',
      curpage: '1',
      pageSize: '40',
      onRecruitYN: 'N', // N = 마감 포함
    });
    const res = await fetch(
      `https://www.catch.co.kr/api/v1.0/recruit/information/getRecruitList?${params.toString()}`,
      {
        headers: {
          'User-Agent': CATCH_UA,
          Accept: 'application/json, text/plain, */*',
          'x-is-pc': 'true',
          Referer: 'https://www.catch.co.kr/',
        },
      },
    );
    if (!res.ok) return [];
    const data = await res.json() as { recruitData?: unknown[] };
    return (data.recruitData ?? []).map((item: unknown) => {
      const it = item as Record<string, unknown>;
      return {
        title: String(it.RecruitTitle ?? ''),
        company: String(it.CompName ?? ''),
        deadline: String(it.ApplyEndDatetime ?? ''),
        type: String(it.CareerGubunCode ?? ''),
        url: `https://www.catch.co.kr/NCS/RecruitInfoDetails/${it.RecruitID}`,
        source: 'catch',
      };
    });
  } catch {
    return [];
  }
}

// ── 잡플래닛 ─────────────────────────────────────────────────────────────────

export async function scrapeJobplanet(page: Page, keyword: string): Promise<ExtractedJob[]> {
  const url = `https://www.jobplanet.co.kr/search/job?query=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle();

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];

    const nextEl = document.getElementById('__NEXT_DATA__');
    if (!nextEl?.textContent) return results;

    try {
      const nextData = JSON.parse(nextEl.textContent) as unknown;

      // 공고 배열 재귀 탐색
      const findPostings = (obj: unknown): unknown[] => {
        if (!obj || typeof obj !== 'object') return [];
        if (Array.isArray(obj)) {
          if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null &&
              'title' in (obj[0] as object) && 'company' in (obj[0] as object)) return obj;
          for (const item of obj) {
            const found = findPostings(item);
            if (found.length > 0) return found;
          }
        } else {
          for (const val of Object.values(obj as Record<string, unknown>)) {
            const found = findPostings(val);
            if (found.length > 0) return found;
          }
        }
        return [];
      };

      const postings = findPostings(nextData);
      for (const p of postings) {
        if (!p || typeof p !== 'object') continue;
        const post = p as Record<string, unknown>;
        const id = post.id as number | undefined;
        const title = (post.title as string | undefined)?.trim();
        if (!id || !title) continue;

        const company = (post.company as Record<string, unknown> | undefined);
        const companyName = (company?.name as string | undefined) ?? '';
        const deadline = (post.deadline_message as string | undefined) ?? '';
        const jobType = (post.job_type as string | undefined) ?? '';

        results.push({
          title,
          company: companyName,
          deadline,
          type: jobType,
          url: `https://www.jobplanet.co.kr/job/postings/${id}`,
          source: 'jobplanet',
        });
      }
    } catch { /* ignore */ }

    return results;
  }) as Promise<ExtractedJob[]>;
}

// ── 인크루트 ─────────────────────────────────────────────────────────────────

export async function scrapeIncruit(page: Page, keyword: string): Promise<ExtractedJob[]> {
  const url = `https://search.incruit.com/list/search.asp?col=job&kw=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(2_000);

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];
    const seen = new Set<string>();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('ul.c_row'));
    for (const row of rows) {
      const link = row.querySelector<HTMLAnchorElement>('a[href*="jobpost.asp"]');
      if (!link) continue;
      const href = link.href || link.getAttribute('href') || '';
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) continue;

      const company = (row.querySelector('a.cpname')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const metas = Array.from(row.querySelectorAll('.cl_md span')).map((el) => el.textContent?.trim() ?? '').filter(Boolean);
      const deadline = row.querySelector('.cell_last .cl_btm span')?.textContent?.trim() ?? '';

      results.push({ title, company, deadline, type: metas.join(', '), url: href, source: 'incruit' });
    }
    return results;
  }) as Promise<ExtractedJob[]>;
}

// ── 점핏 ─────────────────────────────────────────────────────────────────────

export async function scrapeJumpit(page: Page, keyword: string): Promise<ExtractedJob[]> {
  const url = `https://jumpit.saramin.co.kr/search?q=${encodeURIComponent(keyword)}&sort=rsp_rate`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(3_000);

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];

    const findArray = (obj: unknown): unknown[] | null => {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null &&
          ('id' in (obj[0] as object)) && ('title' in (obj[0] as object))) return obj;
      for (const val of Object.values(obj as Record<string, unknown>)) {
        const found = findArray(val);
        if (found) return found;
      }
      return null;
    };

    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl?.textContent) {
      try {
        const data = JSON.parse(nextEl.textContent) as unknown;
        const positions = findArray(data);
        if (positions) {
          for (const p of positions) {
            const pos = p as Record<string, unknown>;
            const id = pos.id as number | string | undefined;
            const title = (pos.title as string | undefined)?.trim();
            if (!id || !title) continue;
            const co = pos.company as Record<string, unknown> | undefined;
            results.push({
              title,
              company: (co?.name as string | undefined) ?? (pos.companyName as string | undefined) ?? '',
              deadline: (pos.endAt as string | undefined) ?? (pos.closeAt as string | undefined) ?? '',
              type: (pos.employmentType as string | undefined) ?? '',
              url: `https://jumpit.saramin.co.kr/position/${id}`,
              source: 'jumpit',
            });
          }
          return results;
        }
      } catch { /* ignore */ }
    }

    // DOM fallback
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[class*="PositionCard"], article, section li'));
    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/position/"]');
      if (!link) continue;
      const href = link.href || ('https://jumpit.saramin.co.kr' + (link.getAttribute('href') ?? ''));
      const title = (card.querySelector('[class*="title"]')?.textContent ?? link.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const company = (card.querySelector('[class*="company"], [class*="Company"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      results.push({ title, company, deadline: '', type: '', url: href, source: 'jumpit' });
    }
    return results;
  }) as Promise<ExtractedJob[]>;
}

// ── 랠릿 ─────────────────────────────────────────────────────────────────────

export async function scrapeRallit(page: Page, keyword: string): Promise<ExtractedJob[]> {
  const url = `https://www.rallit.com/positions?keyword=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(3_000);

  return page.evaluate(() => {
    const results: ExtractedJob[] = [];

    const findPositions = (obj: unknown): unknown[] | null => {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null &&
          'title' in (obj[0] as object)) return obj;
      for (const val of Object.values(obj as Record<string, unknown>)) {
        const found = findPositions(val);
        if (found) return found;
      }
      return null;
    };

    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl?.textContent) {
      try {
        const data = JSON.parse(nextEl.textContent) as unknown;
        const positions = findPositions(data);
        if (positions) {
          for (const p of positions) {
            const pos = p as Record<string, unknown>;
            const id = pos.id as number | string | undefined;
            const title = (pos.title as string | undefined)?.trim();
            if (!id || !title) continue;
            const co = pos.company as Record<string, unknown> | undefined;
            results.push({
              title,
              company: (co?.name as string | undefined) ?? '',
              deadline: (pos.expiredAt as string | undefined) ?? '',
              type: (pos.employmentType as string | undefined) ?? '',
              url: `https://www.rallit.com/job-postings/${id}`,
              source: 'rallit',
            });
          }
          return results;
        }
      } catch { /* ignore */ }
    }

    // DOM fallback
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[class*="position"], [class*="Position"], article'));
    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/job-postings/"]');
      if (!link) continue;
      const href = link.href || ('https://www.rallit.com' + (link.getAttribute('href') ?? ''));
      const title = (card.querySelector('[class*="title"], h2, h3')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const company = (card.querySelector('[class*="company"], [class*="Company"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      results.push({ title, company, deadline: '', type: '', url: href, source: 'rallit' });
    }
    return results;
  }) as Promise<ExtractedJob[]>;
}

// ── Generic 상세 추출 ─────────────────────────────────────────────────────────

export async function extractGenericDetail(page: Page, url: string): Promise<ExtractedJob | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await new Promise<void>((r) => setTimeout(r, 1_500));
  } catch {
    return null;
  }

  return page.evaluate((src: string) => {
    const og = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.getAttribute('content')?.trim() ?? '';

    // JSON-LD JobPosting 스키마
    const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const s of ldScripts) {
      try {
        const ld = JSON.parse(s.textContent ?? '') as Record<string, unknown>;
        const type = (ld['@type'] as string | undefined)?.toLowerCase();
        if (type === 'jobposting') {
          return {
            title: String(ld.title ?? ''),
            company: String((ld.hiringOrganization as Record<string, unknown> | undefined)?.name ?? ''),
            deadline: String(ld.validThrough ?? ''),
            type: String(ld.employmentType ?? ''),
            url: src,
            source: new URL(src).hostname.replace(/^www\./, ''),
          } satisfies { title: string; company: string; deadline: string; type: string; url: string; source: string };
        }
      } catch { /* ignore */ }
    }

    const title = og('meta[property="og:title"]') || document.title;
    if (!title) return null;

    const siteName = og('meta[property="og:site_name"]');
    return {
      title,
      company: siteName,
      deadline: '',
      type: '',
      url: src,
      source: new URL(src).hostname.replace(/^www\./, ''),
    };
  }, url) as Promise<ExtractedJob | null>;
}

// ── URL 분류 ─────────────────────────────────────────────────────────────────

const JOB_SITE_PATTERNS: [string, RegExp][] = [
  ['linkareer', /linkareer\.com\/activity\/\d+/],
  ['jobkorea', /jobkorea\.co\.kr\/Recruit\/GI_Read\/\d+/],
  ['saramin', /saramin\.co\.kr\/.+relay\/view|saramin\.co\.kr\/zf_user\/jobs/],
  ['catch', /catch\.co\.kr\/NCS\/RecruitInfoDetails\/\d+/],
  ['jobplanet', /jobplanet\.co\.kr\/job\/postings\/\d+/],
  ['wanted', /wanted\.co\.kr\/wd\/\d+/],
  ['jumpit', /jumpit\.saramin\.co\.kr\/position\/\d+/],
  ['rallit', /rallit\.com\/job-postings\/\d+/],
  ['incruit', /incruit\.com\/jobdb_info\/jobpost\.asp/],
];

export function classifyJobSiteUrl(url: string): string | null {
  for (const [site, pattern] of JOB_SITE_PATTERNS) {
    if (pattern.test(url)) return site;
  }
  return null;
}
