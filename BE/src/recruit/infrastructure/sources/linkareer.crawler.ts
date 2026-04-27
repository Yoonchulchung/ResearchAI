import puppeteer from 'puppeteer';
import { randomUUID } from 'crypto';
import { JobPosting } from '../../domain/job-posting.model';
import { CollectQuery, JobSource } from '../../domain/job-source.interface';

const BASE_URL = 'https://linkareer.com';
const BROWSER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

/** 활동 유형 중 채용·인턴 관련만 허용 */
const JOB_TYPES = ['채용', '인턴', '공채', '신입', '경력', '채용연계', 'job', 'recruit'];

function isJobRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return JOB_TYPES.some((t) => lower.includes(t));
}

export class LinkareerCrawler implements JobSource {
  readonly name = 'linkareer';
  readonly type = 'crawler' as const;

  isAvailable(): boolean {
    return true;
  }

  async *collect(query: CollectQuery): AsyncGenerator<JobPosting> {
    const limit = query.limit ?? 30;
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

    try {
      browser = await puppeteer.launch({ headless: true, args: BROWSER_ARGS });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

      let collected = 0;
      let pageNum = 1;

      while (collected < limit && pageNum <= 3) {
        const url = `${BASE_URL}/search?q=${encodeURIComponent(query.keyword)}&page=${pageNum}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        // JS 렌더링 대기
        await new Promise<void>((r) => setTimeout(r, 2000));

        const items = await page.evaluate((baseUrl: string) => {
          const results: {
            title: string;
            company: string;
            tags: string[];
            deadline: string;
            href: string;
          }[] = [];

          // /activity/ 경로를 가진 링크를 포함하는 카드 컨테이너를 찾음
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/activity/"]'));

          for (const link of links) {
            const href = link.href || (link.getAttribute('href') ?? '');
            if (!href.includes('/activity/')) continue;

            // 카드 컨테이너 — li, article, div[class*="card"], div[class*="item"] 중 첫 번째 조상
            const card = link.closest('li, article, [class*="Card"], [class*="card"], [class*="Item"], [class*="item"]') ?? link.parentElement;
            if (!card) continue;

            const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (!text) continue;

            // 제목: link 자체의 텍스트 또는 카드 내 h2/h3/strong
            const titleEl = link.querySelector('h1,h2,h3,h4,strong,p') ?? link;
            let title = (titleEl.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (!title) title = link.textContent?.replace(/\s+/g, ' ').trim() ?? '';

            // 기관명: 제목 아래 또는 카드 내 두 번째 텍스트 요소
            const textNodes = Array.from(card.querySelectorAll('span,p,div'))
              .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
              .filter((t) => t && t !== title);
            const company = textNodes.find((t) => t.length > 0 && t.length < 50) ?? '';

            // 태그: [태그] 패턴 또는 작은 span들
            const tagEls = Array.from(card.querySelectorAll('span[class*="tag"],span[class*="Tag"],span[class*="badge"],span[class*="Badge"]'));
            const tags = tagEls.map((el) => (el.textContent ?? '').trim()).filter(Boolean);

            // 마감일
            const deadlineMatch = text.match(/(\d{2,4}[./]\d{1,2}[./]\d{1,2})|마감|D-\d+/);
            const deadline = deadlineMatch ? deadlineMatch[0] : '';

            const fullUrl = href.startsWith('http') ? href : baseUrl + href;

            results.push({ title, company, tags, deadline, href: fullUrl });
          }

          // 중복 href 제거
          const seen = new Set<string>();
          return results.filter((r) => {
            if (!r.title || seen.has(r.href)) return false;
            seen.add(r.href);
            return true;
          });
        }, BASE_URL);

        if (items.length === 0) break;

        for (const item of items) {
          if (collected >= limit) break;
          // 채용/인턴 관련 필터 — 태그나 제목에 채용 관련 키워드가 있을 때만
          const combined = `${item.title} ${item.company} ${item.tags.join(' ')}`;
          if (!isJobRelated(combined) && query.keyword && !combined.includes(query.keyword)) continue;

          yield {
            id: randomUUID(),
            source: 'linkareer',
            sourceType: 'crawler',
            title: item.title,
            company: item.company,
            location: '',
            description: item.tags.join(', '),
            skills: item.tags,
            url: item.href,
            postedAt: item.deadline || null,
            collectedAt: new Date().toISOString(),
          };
          collected++;
        }

        pageNum++;
        await new Promise<void>((r) => setTimeout(r, 500));
      }
    } finally {
      await browser?.close();
    }
  }
}
