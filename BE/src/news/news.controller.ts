import { Controller, Get, Query } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PuppeteerService } from './puppeteer.service';

export interface CountryNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

interface NewsItem {
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

const CATEGORY_QUERIES: Record<string, string> = {
  it:       'IT 기술 AI',
  economy:  '경제 금융',
  society:  '사회 사건',
  politics: '정치 국회',
  world:    '국제 세계',
  culture:  '문화 엔터테인먼트',
  science:  '과학 우주',
};

// 키워드 추출 시 제거할 불용어
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

// ── 분쟁 감지용 데이터 ───────────────────────────────────────

export interface ConflictZone {
  code: string;        // ISO numeric
  score: number;       // 뉴스 언급 점수 (높을수록 분쟁 강도 ↑)
  headlines: string[]; // 근거 헤드라인
}

// 분쟁 관련 키워드 (한국어 + 영어)
const CONFLICT_KEYWORDS = [
  '전쟁', '교전', '공격', '폭격', '침공', '내전', '분쟁', '충돌', '사상자', '사망',
  '포격', '미사일', '드론', '폭탄', '테러', '반군', '군사작전', '휴전', '민간인',
  '탈출', '피난', '봉쇄', '점령', '저항', '전투', '전선', '공습',
  'war', 'attack', 'conflict', 'invasion', 'bombing', 'airstrike', 'missile',
  'ceasefire', 'casualties', 'troops', 'military', 'offensive', 'hostage',
  'occupation', 'resistance', 'rebel', 'coup',
];

// 국가명(한/영) → ISO numeric 코드
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
      // 분쟁 키워드가 많이 겹칠수록 점수 가중
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
    // 특수문자·숫자·영문 혼합 제거 후 공백 분리
    const cleaned = text
      .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ');
    for (const word of words) {
      const w = word.trim();
      // 2글자 미만, 숫자만, 불용어 제외
      if (w.length < 2 || /^\d+$/.test(w) || KO_STOPWORDS.has(w)) continue;
      // 순수 영문 2글자 제외
      if (/^[a-zA-Z]{1,2}$/.test(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2) // 2회 이상 등장한 키워드만
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

@Controller('news')
export class NewsController {
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly puppeteer: PuppeteerService) {}
  @Get('google')
  async getGoogleNews(
    @Query('category') category = 'it',
  ): Promise<NewsItem[]> {
    const query = CATEGORY_QUERIES[category] ?? CATEGORY_QUERIES.it;
    return fetchNewsForQuery(query);
  }

  @Get('keywords')
  async getKeywords(
    @Query('limit') limitStr = '30',
  ): Promise<KeywordItem[]> {
    const limit = Math.min(parseInt(limitStr, 10) || 30, 60);

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

  @Get('summary')
  async getNewsSummary(): Promise<{ summary: string; generatedAt: string }> {
    const queries = ['IT AI 기술', '경제 금융 증시', '사회 정치', '국제 세계', '과학 환경'];
    const results = await Promise.allSettled(queries.map(fetchNewsForQuery));

    const allTitles: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTitles.push(...r.value.map((item) => item.title));
      }
    }

    const titleSample = allTitles.slice(0, 30).join('\n');

    const message = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `다음은 오늘의 실시간 뉴스 헤드라인 목록이야.

[헤드라인]
${titleSample}

위 헤드라인을 분석해서 오늘의 주요 뉴스 5개를 뽑아줘.
각 항목은 아래 형식으로 작성해:

• [구체적 사실]: 실제 기사에 등장한 기업명·인물명·수치·지명 등을 반드시 포함해서 한 문장으로 설명해줘. 검색하면 바로 찾을 수 있을 만큼 구체적으로 써줘.

추상적인 표현("기술 발전", "경제 위기" 등) 없이, 헤드라인에 있는 고유명사와 구체적 내용만 사용해.`,
        },
      ],
    });

    const summary = message.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '';
    return { summary, generatedAt: new Date().toISOString() };
  }

  @Get('conflict-zones')
  async getConflictZones(): Promise<ConflictZone[]> {
    // 전쟁·분쟁 관련 쿼리로 뉴스 병렬 수집
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

  @Get('country')
  async getCountryNews(
    @Query('name') name = '',
    @Query('limit') limitStr = '8',
  ): Promise<CountryNewsItem[]> {
    const limit = Math.min(parseInt(limitStr, 10) || 8, 20);
    if (!name.trim()) return [];
    const items = await fetchNewsForQuery(name);
    return items.slice(0, limit).map(({ title, link, source, pubDate }) => ({
      title, link, source, pubDate,
    }));
  }

  @Get('article')
  async getArticleContent(
    @Query('url') url = '',
  ): Promise<{ title: string; content: string; image?: string; finalUrl?: string }> {
    if (!url.trim()) return { title: '', content: '' };
    try {
      return await this.puppeteer.fetchArticle(url);
    } catch {
      return { title: '', content: '', finalUrl: url };
    }
  }
}
