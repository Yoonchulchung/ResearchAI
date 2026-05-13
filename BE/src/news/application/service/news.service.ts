import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderService } from '../../../ai/infrastructure/ai-provider.service';
import { PuppeteerService } from '../../../shared/infrastructure/browser/puppeteer.service';
import { NewsBriefingEntity } from '../../domain/entity/news-briefing.entity';
import { NewsProviderService } from '../../infrastructure/news-provider.service';
import { AppConfigService, CONFIG_KEYS } from '../../../config/application/app-config.service';

export interface CountryNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

export interface KeywordItem {
  keyword: string;
  count: number;
}

export interface ConflictZone {
  code: string;        // ISO numeric
  score: number;       // 뉴스 언급 점수 (높을수록 분쟁 강도 ↑)
  headlines: string[]; // 근거 헤드라인
}

const CATEGORY_QUERIES: Record<string, string> = {
  it:       'IT 기술 AI',
  economy:  '경제 금융',
  society:  '사회 사건',
  politics: '정치 국회',
  world:    '국제 세계',
  culture:  '문화 엔터테인먼트',
  science:  '과학 우주',
};

const KO_STOPWORDS = new Set([
  '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '에서',
  '으로', '하다', '했다', '한다', '된다', '있다', '없다', '등', '및', '또', '더', '것',
  '수', '그', '저', '우리', '하는', '하여', '하며', '하고', '라며', '라고', '이라고',
  '것으로', '것이', '것을', '것은', '있는', '없는', '위해', '통해', '대한', '따른',
  '관련', '경우', '이번', '지난', '오는', '전', '후', '때', '중', '간', '내', '외',
  '년', '월', '일', '시', '분', '원', '달러', '위', '아래', '대해', '부터', '까지',
  '한편', '또한', '다만', '오히려', '결국', '이미', '앞서', '이에', '이를', '이후',
  '기자', '뉴스', '연합', '특파원', '코리아', '헤럴드', '매일', '조선', '동아', '한국',
  'the', 'a', 'an', 'of', 'in', 'to', 'and', 'for', 'is', 'on', 'at', 'by', 'or',
]);

const CONFLICT_KEYWORDS = [
  '전쟁', '교전', '공격', '폭격', '침공', '내전', '분쟁', '충돌', '사상자', '사망',
  '포격', '미사일', '드론', '폭탄', '테러', '반군', '군사작전', '휴전', '민간인',
  '탈출', '피난', '봉쇄', '점령', '저항', '전투', '전선', '공습',
  'war', 'attack', 'conflict', 'invasion', 'bombing', 'airstrike', 'missile',
  'ceasefire', 'casualties', 'troops', 'military', 'offensive', 'hostage',
  'occupation', 'resistance', 'rebel', 'coup',
];

const COUNTRY_NAME_MAP: Array<{ names: string[]; code: string }> = [
  { names: ['우크라이나', 'ukraine'], code: '804' },
  { names: ['러시아', 'russia'], code: '643' },
  { names: ['이스라엘', 'israel'], code: '376' },
  { names: ['팔레스타인', '가자', 'palestine', 'gaza'], code: '275' },
  { names: ['이란', 'iran'], code: '364' },
  { names: ['레바논', 'lebanon'], code: '422' },
  { names: ['시리아', 'syria'], code: '760' },
  { names: ['예멘', 'yemen'], code: '887' },
  { names: ['수단', 'sudan'], code: '729' },
  { names: ['미얀마', '버마', 'myanmar', 'burma'], code: '104' },
  { names: ['에티오피아', 'ethiopia'], code: '231' },
  { names: ['소말리아', 'somalia'], code: '706' },
  { names: ['아이티', 'haiti'], code: '332' },
  { names: ['콩고', 'congo'], code: '180' },
  { names: ['말리', 'mali'], code: '466' },
  { names: ['니제르', 'niger'], code: '562' },
  { names: ['부르키나파소', 'burkina'], code: '854' },
  { names: ['리비아', 'libya'], code: '434' },
  { names: ['이라크', 'iraq'], code: '368' },
  { names: ['아프가니스탄', 'afghanistan'], code: '004' },
  { names: ['파키스탄', 'pakistan'], code: '586' },
  { names: ['인도', 'india'], code: '356' },
  { names: ['중국', 'china'], code: '156' },
  { names: ['대만', 'taiwan'], code: '158' },
  { names: ['북한', '북조선', 'north korea'], code: '408' },
  { names: ['사우디', 'saudi'], code: '682' },
  { names: ['튀르키예', '터키', 'turkey', 'türkiye'], code: '792' },
  { names: ['나이지리아', 'nigeria'], code: '566' },
  { names: ['카메룬', 'cameroon'], code: '120' },
  { names: ['모잠비크', 'mozambique'], code: '508' },
];



function extractKeywords(texts: string[], limit: number): KeywordItem[] {
  const freq = new Map<string, number>();

  for (const text of texts) {
    const cleaned = text
      .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ');
    for (const word of words) {
      const w = word.trim();
      if (w.length < 2 || /^\d+$/.test(w) || KO_STOPWORDS.has(w)) continue;
      if (/^[a-zA-Z]{1,2}$/.test(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

function detectConflictCountries(titles: string[]): ConflictZone[] {
  const scores = new Map<string, { score: number; headlines: string[] }>();

  for (const title of titles) {
    const lower = title.toLowerCase();
    const hasConflict = CONFLICT_KEYWORDS.some((kw) => lower.includes(kw) || title.includes(kw));
    if (!hasConflict) continue;

    for (const { names, code } of COUNTRY_NAME_MAP) {
      const mentioned = names.some((n) => lower.includes(n.toLowerCase()) || title.includes(n));
      if (!mentioned) continue;

      const entry = scores.get(code) ?? { score: 0, headlines: [] };
      const kwCount = CONFLICT_KEYWORDS.filter((kw) => lower.includes(kw) || title.includes(kw)).length;
      entry.score += 1 + (kwCount - 1) * 0.5;
      if (entry.headlines.length < 3) entry.headlines.push(title);
      scores.set(code, entry);
    }
  }

  return [...scores.entries()]
    .map(([code, { score, headlines }]) => ({ code, score: Math.round(score * 10) / 10, headlines }))
    .sort((a, b) => b.score - a.score);
}

export type { MarketItem, ChartPoint } from './market.service';


@Injectable()
export class NewsService {
  constructor(
    private readonly puppeteer: PuppeteerService,
    private readonly aiProvider: AiProviderService,
    @InjectRepository(NewsBriefingEntity)
    private readonly briefingRepo: Repository<NewsBriefingEntity>,
    private readonly newsProvider: NewsProviderService,
    private readonly appConfig: AppConfigService,
  ) {}

  private getTodayKey(): string {
    return new Date().toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\. /g, '-').replace('.', '');
  }

  // ─── Raw data cache helpers ────────────────────────────────────────────────

  private async getRawCache<T>(cacheKey: string): Promise<T | null> {
    const cached = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (cached?.rawData) {
      return JSON.parse(cached.rawData) as T;
    }
    return null;
  }

  private async setRawCache(cacheKey: string, data: unknown): Promise<void> {
    const existing = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (existing) {
      await this.briefingRepo.update({ date: cacheKey }, { rawData: JSON.stringify(data) });
    } else {
      await this.briefingRepo.save({
        date: cacheKey,
        titlesHash: '',
        summary: '',
        rawData: JSON.stringify(data),
      });
    }
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async getGoogleNews(category: string): Promise<NewsItem[]> {
    const cacheKey = `raw-google-${category}-${this.getTodayKey()}`;
    const cached = await this.getRawCache<NewsItem[]>(cacheKey);
    if (cached) return cached;

    const query = CATEGORY_QUERIES[category] ?? CATEGORY_QUERIES.it;
    const items = await this.newsProvider.fetchNewsByQuery(query);
    await this.setRawCache(cacheKey, items);
    return items;
  }

  async getKeywords(limit: number): Promise<KeywordItem[]> {
    const rawCacheKey = `raw-kw-titles-${this.getTodayKey()}`;
    let allTitles = await this.getRawCache<string[]>(rawCacheKey);

    if (!allTitles) {
      const queries = ['IT AI 기술', '경제 금융 증시', '사회 정치', '국제 세계', '과학 환경'];
      const results = await Promise.allSettled(queries.map((q) => this.newsProvider.fetchNewsByQuery(q)));
      allTitles = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          allTitles.push(...r.value.map((item) => item.title));
        }
      }
      await this.setRawCache(rawCacheKey, allTitles);
    }

    return extractKeywords(allTitles, limit);
  }

  async getConflictZones(): Promise<ConflictZone[]> {
    const cacheKey = `raw-conflicts-${this.getTodayKey()}`;
    const cached = await this.getRawCache<ConflictZone[]>(cacheKey);
    if (cached) return cached;

    const queries = [
      '전쟁 교전 공격 폭격',
      'war conflict attack military',
      '분쟁 사상자 내전 반군',
      'ceasefire invasion troops casualties',
      '이스라엘 가자 우크라이나 러시아 이란',
    ];
    const results = await Promise.allSettled(queries.map((q) => this.newsProvider.fetchNewsByQuery(q)));

    const allTitles: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTitles.push(...r.value.map((item) => item.title));
      }
    }

    const zones = detectConflictCountries(allTitles);
    await this.setRawCache(cacheKey, zones);
    return zones;
  }

  async getCountryNews(name: string, limit: number): Promise<CountryNewsItem[]> {
    if (!name.trim()) return [];
    const items = await this.newsProvider.fetchNewsByQuery(name);
    return items.slice(0, limit).map(({ title, link, source, pubDate }) => ({
      title, link, source, pubDate,
    }));
  }

  async getArticleContent(url: string): Promise<{ title: string; content: string; image?: string; finalUrl?: string }> {
    if (!url.trim()) return { title: '', content: '' };
    try {
      return await this.puppeteer.fetchArticle(url);
    } catch {
      return { title: '', content: '', finalUrl: url };
    }
  }

  /** 오늘 날짜의 모든 캐시(원시 데이터 + AI 요약)를 삭제하여 다음 요청 시 재조회하도록 함 */
  async refreshTodayCache(): Promise<void> {
    const today = this.getTodayKey();
    await this.briefingRepo
      .createQueryBuilder()
      .delete()
      .where('date LIKE :pattern', { pattern: `%-${today}` })
      .execute();
  }
}
