import { ConflictZone, KeywordItem } from 'src/news/application/news.types';

const STOPWORDS = new Set([
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '의',
  '에',
  '로',
  '와',
  '과',
  '도',
  '만',
  '에서',
  '으로',
  '하다',
  '했다',
  '한다',
  '된다',
  '있다',
  '없다',
  '등',
  '및',
  '또',
  '더',
  '것',
  '수',
  '그',
  '저',
  '우리',
  '하는',
  '하여',
  '하며',
  '하고',
  '라며',
  '라고',
  '이라고',
  '것으로',
  '것이',
  '것을',
  '것은',
  '있는',
  '없는',
  '위해',
  '통해',
  '대한',
  '따른',
  '관련',
  '경우',
  '이번',
  '지난',
  '오는',
  '전',
  '후',
  '때',
  '중',
  '간',
  '내',
  '외',
  '년',
  '월',
  '일',
  '시',
  '분',
  '원',
  '달러',
  '위',
  '아래',
  '대해',
  '부터',
  '까지',
  '한편',
  '또한',
  '다만',
  '오히려',
  '결국',
  '이미',
  '앞서',
  '이에',
  '이를',
  '이후',
  '기자',
  '뉴스',
  '연합',
  '특파원',
  '코리아',
  '헤럴드',
  '매일',
  '조선',
  '동아',
  '한국',
  'the',
  'a',
  'an',
  'of',
  'in',
  'to',
  'and',
  'for',
  'is',
  'on',
  'at',
  'by',
  'or',
]);

const CONFLICT_KEYWORDS = [
  '전쟁',
  '교전',
  '공격',
  '폭격',
  '침공',
  '내전',
  '분쟁',
  '충돌',
  '사상자',
  '사망',
  '포격',
  '미사일',
  '드론',
  '폭탄',
  '테러',
  '반군',
  '군사작전',
  '휴전',
  '민간인',
  '탈출',
  '피난',
  '봉쇄',
  '점령',
  '저항',
  '전투',
  '전선',
  '공습',
  'war',
  'attack',
  'conflict',
  'invasion',
  'bombing',
  'airstrike',
  'missile',
  'ceasefire',
  'casualties',
  'troops',
  'military',
  'offensive',
  'hostage',
  'occupation',
  'resistance',
  'rebel',
  'coup',
];

const COUNTRIES: Array<{ names: string[]; code: string }> = [
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

export function extractKeywords(texts: string[], limit: number): KeywordItem[] {
  const frequencies = new Map<string, number>();

  for (const text of texts) {
    const words = text
      .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ');

    for (const word of words) {
      const normalized = word.trim();
      if (
        normalized.length < 2 ||
        /^\d+$/.test(normalized) ||
        /^[a-zA-Z]{1,2}$/.test(normalized) ||
        STOPWORDS.has(normalized)
      ) {
        continue;
      }
      frequencies.set(normalized, (frequencies.get(normalized) ?? 0) + 1);
    }
  }

  return [...frequencies.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

export function detectConflictCountries(titles: string[]): ConflictZone[] {
  const scores = new Map<string, { score: number; headlines: string[] }>();

  for (const title of titles) {
    const lower = title.toLowerCase();
    const matchedKeywords = CONFLICT_KEYWORDS.filter(
      (keyword) => lower.includes(keyword) || title.includes(keyword),
    );
    if (matchedKeywords.length === 0) continue;

    for (const country of COUNTRIES) {
      const mentioned = country.names.some(
        (name) => lower.includes(name.toLowerCase()) || title.includes(name),
      );
      if (!mentioned) continue;

      const entry = scores.get(country.code) ?? {
        score: 0,
        headlines: [],
      };
      entry.score += 1 + (matchedKeywords.length - 1) * 0.5;
      if (entry.headlines.length < 3) entry.headlines.push(title);
      scores.set(country.code, entry);
    }
  }

  return [...scores.entries()]
    .map(([code, value]) => ({
      code,
      score: Math.round(value.score * 10) / 10,
      headlines: value.headlines,
    }))
    .sort((a, b) => b.score - a.score);
}
