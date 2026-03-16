import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderService } from '../../../ai/application/ai-provider.service';
import { PuppeteerService } from '../../puppeteer.service';
import { NewsBriefingEntity } from '../../domain/entity/news-briefing.entity';

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

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

function parseGoogleNewsRSS(xml: string): NewsItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map((m) => {
    const block = m[1];
    const rawTitle = extractTag(block, 'title');
    const dashIdx = rawTitle.lastIndexOf(' - ');
    const title  = dashIdx > 0 ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
    const source = dashIdx > 0 ? rawTitle.slice(dashIdx + 3).trim() : '';
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const rawDesc = extractTag(block, 'description').replace(/<[^>]+>/g, '').trim();
    return { title, link, source, pubDate, description: rawDesc };
  });
}

async function fetchNewsForQuery(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' },
  });
  const xml = await res.text();
  return parseGoogleNewsRSS(xml).slice(0, 15);
}

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

interface GHRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
}

interface HFItem {
  id: string;
  likes: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
}

@Injectable()
export class NewsService {
  constructor(
    private readonly puppeteer: PuppeteerService,
    private readonly aiProvider: AiProviderService,
    @InjectRepository(NewsBriefingEntity)
    private readonly briefingRepo: Repository<NewsBriefingEntity>,
  ) {}

  private getTodayKey(): string {
    return new Date().toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\. /g, '-').replace('.', '');
  }

  private async getCachedOrGenerate(
    cacheKey: string,
    _hashSource: string,
    prompt: string,
  ): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    const cached = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (cached) {
      return { summary: cached.summary, generatedAt: cached.updatedAt.toISOString(), cached: true };
    }
    const summary = await this.aiProvider.call('claude-haiku-4-5-20251001', '', prompt);
    await this.briefingRepo.save({ date: cacheKey, titlesHash: '', summary });
    return { summary, generatedAt: new Date().toISOString(), cached: false };
  }

  async getGoogleNews(category: string): Promise<NewsItem[]> {
    const query = CATEGORY_QUERIES[category] ?? CATEGORY_QUERIES.it;
    return fetchNewsForQuery(query);
  }

  async getKeywords(limit: number): Promise<KeywordItem[]> {
    const queries = ['IT AI 기술', '경제 금융 증시', '사회 정치', '국제 세계', '과학 환경'];
    const results = await Promise.allSettled(queries.map(fetchNewsForQuery));

    const allTitles: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTitles.push(...r.value.map((item) => item.title));
      }
    }

    return extractKeywords(allTitles, limit);
  }

  async getNewsSummary(): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    const queries = ['IT AI 기술', '경제 금융 증시', '사회 정치', '국제 세계', '과학 환경'];
    const results = await Promise.allSettled(queries.map(fetchNewsForQuery));
    const allTitles: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTitles.push(...r.value.map((item) => item.title));
      }
    }
    const titleSample = allTitles.slice(0, 30);
    return this.getCachedOrGenerate(
      `news-${this.getTodayKey()}`,
      titleSample.sort().join('|'),
      `다음은 오늘의 실시간 뉴스 헤드라인 목록이야.\n\n[헤드라인]\n${titleSample.join('\n')}\n\n위 헤드라인을 분석해서 오늘의 주요 뉴스 5개를 뽑아줘.\n각 항목은 아래 형식으로 작성해:\n\n• [구체적 사실]: 실제 기사에 등장한 기업명·인물명·수치·지명 등을 반드시 포함해서 한 문장으로 설명해줘. 검색하면 바로 찾을 수 있을 만큼 구체적으로 써줘.\n\n추상적인 표현("기술 발전", "경제 위기" 등) 없이, 헤드라인에 있는 고유명사와 구체적 내용만 사용해.`,
    );
  }

  async getGithubSummary(since: string): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    const validSince = ['daily', 'weekly', 'monthly'].includes(since) ? since : 'daily';
    const days = validSince === 'monthly' ? 30 : validSince === 'weekly' ? 7 : 1;
    const from = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];

    const res = await fetch(
      `https://api.github.com/search/repositories?q=pushed:>${from}&sort=stars&order=desc&per_page=10`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    const data = await res.json() as { items?: GHRepo[] };
    const repos = data.items ?? [];

    const periodLabel = validSince === 'daily' ? '오늘' : validSince === 'weekly' ? '이번 주' : '이번 달';
    const repoList = repos.map((r, i) =>
      `${i + 1}. ${r.full_name} (⭐${r.stargazers_count}${r.language ? ', ' + r.language : ''})${r.description ? ': ' + r.description : ''}`,
    ).join('\n');

    return this.getCachedOrGenerate(
      `github-${validSince}-${this.getTodayKey()}`,
      repos.map((r) => r.full_name).join('|'),
      `다음은 GitHub에서 ${periodLabel} 가장 핫한 저장소 목록이야.\n\n${repoList}\n\n위 저장소들을 분석해서 현재 개발자 커뮤니티에서 주목받는 트렌드 3~5개를 뽑아줘.\n각 항목은 아래 형식으로 작성해:\n\n• [트렌드]: 실제 저장소명과 스타 수·언어 등 수치를 포함해 한 문장으로 설명해줘.\n\n추상적인 표현 없이 구체적인 저장소명과 기술 스택을 반드시 언급해.`,
    );
  }

  async getHfSummary(category: string): Promise<{ summary: string; generatedAt: string; cached: boolean }> {
    const validCategory = ['models', 'datasets', 'spaces'].includes(category) ? category : 'models';

    const res = await fetch(
      `https://huggingface.co/api/${validCategory}?sort=trendingScore&direction=-1&limit=10`,
    );
    const items = await res.json() as HFItem[];

    const categoryLabel = validCategory === 'models' ? '모델' : validCategory === 'datasets' ? '데이터셋' : '스페이스';
    const itemList = items.slice(0, 10).map((item, i) =>
      `${i + 1}. ${item.id}${item.pipeline_tag ? ` (${item.pipeline_tag})` : ''}${item.trendingScore != null ? ` - 트렌딩 ${item.trendingScore.toFixed(1)}` : ''}${item.likes ? ` ❤️${item.likes}` : ''}`,
    ).join('\n');

    return this.getCachedOrGenerate(
      `hf-${validCategory}-${this.getTodayKey()}`,
      items.map((i) => i.id).join('|'),
      `다음은 Hugging Face에서 현재 가장 트렌딩인 ${categoryLabel} 목록이야.\n\n${itemList}\n\n위 항목들을 분석해서 현재 AI/ML 커뮤니티에서 주목받는 트렌드 3~5개를 뽑아줘.\n각 항목은 아래 형식으로 작성해:\n\n• [트렌드]: 실제 ${categoryLabel}명과 수치를 포함해 한 문장으로 설명해줘.\n\n추상적인 표현 없이 구체적인 이름과 기술을 반드시 언급해.`,
    );
  }

  async getConflictZones(): Promise<ConflictZone[]> {
    const queries = [
      '전쟁 교전 공격 폭격',
      'war conflict attack military',
      '분쟁 사상자 내전 반군',
      'ceasefire invasion troops casualties',
      '이스라엘 가자 우크라이나 러시아 이란',
    ];
    const results = await Promise.allSettled(queries.map(fetchNewsForQuery));

    const allTitles: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTitles.push(...r.value.map((item) => item.title));
      }
    }

    return detectConflictCountries(allTitles);
  }

  async getCountryNews(name: string, limit: number): Promise<CountryNewsItem[]> {
    if (!name.trim()) return [];
    const items = await fetchNewsForQuery(name);
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
}
