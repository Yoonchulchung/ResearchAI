import type { NewsItem } from "@/lib/api/news-feed";

export interface DailyNewsTopicGroup {
  id: string;
  dateKey: string;
  keyword: string | null;
  items: NewsItem[];
}

export interface NewsTopicGroupOptions {
  ignoredKeywords?: string[];
}

const TOPIC_STOPWORDS = new Set([
  "관련",
  "논란",
  "발표",
  "공개",
  "출시",
  "개최",
  "추진",
  "강화",
  "구축",
  "지원",
  "확대",
  "협력",
  "정부",
  "한국",
  "국내",
  "글로벌",
  "기업",
  "업계",
  "시장",
  "기술",
  "서비스",
  "사업",
  "뉴스",
  "오늘",
  "올해",
  "내년",
  "최근",
  "대해",
  "통해",
  "위한",
  "나선",
  "한다",
  "했다",
  "된다",
  "대한",
  "그리고",
  "하지만",
  "ai",
  "ax",
  "it",
]);

const KOREAN_PARTICLES = [
  "으로부터",
  "에서는",
  "에게서",
  "까지는",
  "부터는",
  "이라고",
  "라는",
  "으로",
  "에서",
  "에게",
  "처럼",
  "보다",
  "까지",
  "부터",
  "에도",
  "에는",
  "의",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "와",
  "과",
  "도",
  "로",
  "만",
];

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:quot|amp|lt|gt|#39);/g, " ");
}

function normalizeAlias(value: string) {
  return value
    .replace(/^오픈ai$/i, "openai")
    .replace(/^현대차$/i, "현대자동차")
    .replace(/^기아차$/i, "기아");
}

function normalizeToken(raw: string): string {
  let token = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[^0-9a-z가-힣]+|[^0-9a-z가-힣]+$/g, "");

  for (const particle of KOREAN_PARTICLES) {
    if (token.length >= particle.length + 2 && token.endsWith(particle)) {
      token = token.slice(0, -particle.length);
      break;
    }
  }

  return normalizeAlias(token);
}

function titleTokens(
  title: string,
  ignoredKeywords: Set<string>,
): Set<string> {
  const tokens = stripHtml(title)
    .split(/[\s,，、|·/()[\]{}<>"'`…·:;!?=+]+/)
    .map(normalizeToken)
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 24 &&
        !TOPIC_STOPWORDS.has(token) &&
        !ignoredKeywords.has(token) &&
        !/^\d+$/.test(token),
    );
  return new Set(tokens);
}

function dateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || "날짜 미상";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function keywordDisplay(keyword: string, items: NewsItem[]): string {
  for (const item of items) {
    const rawTokens = stripHtml(item.title).split(
      /[\s,，、|·/()[\]{}<>"'`…·:;!?=+]+/,
    );
    const matched = rawTokens.find(
      (token) => normalizeToken(token) === keyword,
    );
    if (matched) {
      return matched.replace(
        /(?:으로부터|에서는|에게서|까지는|부터는|이라고|라는|으로|에서|에게|처럼|보다|까지|부터|에도|에는|의|은|는|이|가|을|를|에|와|과|도|로|만)$/,
        "",
      );
    }
  }
  return keyword;
}

function groupOneDay(
  day: string,
  items: NewsItem[],
  ignoredKeywords: Set<string>,
): DailyNewsTopicGroup[] {
  const tokensByItem = items.map((item) =>
    titleTokens(item.title, ignoredKeywords),
  );
  const documentFrequency = new Map<string, number>();

  for (const tokens of tokensByItem) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const candidates = [...documentFrequency.entries()]
    .filter(([, frequency]) => frequency >= 2)
    .sort(
      ([leftToken, leftFrequency], [rightToken, rightFrequency]) =>
        rightFrequency - leftFrequency ||
        rightToken.length - leftToken.length ||
        leftToken.localeCompare(rightToken, "ko"),
    );

  const groupByKeyword = new Map<string, NewsItem[]>();
  const ungrouped: NewsItem[] = [];

  items.forEach((item, index) => {
    const keyword = candidates.find(([candidate]) =>
      tokensByItem[index].has(candidate),
    )?.[0];
    if (!keyword) {
      ungrouped.push(item);
      return;
    }
    const group = groupByKeyword.get(keyword) ?? [];
    group.push(item);
    groupByKeyword.set(keyword, group);
  });

  const order = new Map(items.map((item, index) => [item.link, index]));
  const groups: DailyNewsTopicGroup[] = [];
  for (const [keyword, groupItems] of groupByKeyword) {
    if (groupItems.length < 2) {
      ungrouped.push(...groupItems);
      continue;
    }
    groups.push({
      id: `${day}:${keyword}`,
      dateKey: day,
      keyword: keywordDisplay(keyword, groupItems),
      items: groupItems,
    });
  }
  for (const item of ungrouped) {
    groups.push({
      id: `${day}:${item.link}`,
      dateKey: day,
      keyword: null,
      items: [item],
    });
  }

  return groups.sort(
    (left, right) =>
      Math.min(...left.items.map((item) => order.get(item.link) ?? 0)) -
      Math.min(...right.items.map((item) => order.get(item.link) ?? 0)),
  );
}

export function groupNewsByDailyTopic(
  items: NewsItem[],
  options: NewsTopicGroupOptions = {},
): DailyNewsTopicGroup[] {
  const ignoredKeywords = new Set(
    (options.ignoredKeywords ?? [])
      .flatMap((keyword) =>
        keyword.split(/[\s,，、|·/()[\]{}<>"'`…·:;!?=+]+/),
      )
      .map(normalizeToken)
      .filter(Boolean),
  );
  const byDate = new Map<string, NewsItem[]>();
  for (const item of items) {
    const day = dateKey(item.pubDate);
    const dayItems = byDate.get(day) ?? [];
    dayItems.push(item);
    byDate.set(day, dayItems);
  }

  return [...byDate.entries()].flatMap(([day, dayItems]) =>
    groupOneDay(day, dayItems, ignoredKeywords),
  );
}
