export interface DeduplicatableNewsItem {
  title: string;
  url?: string | null;
  link?: string | null;
  publishedAt?: string | null;
  pubDate?: string | null;
  fetchedAt?: string | Date | null;
  snippet?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

const DEFAULT_NEWS_TITLE_COSINE_THRESHOLD = 0.84;
const UNKNOWN_DATE_TITLE_COSINE_THRESHOLD = 0.97;

function normalizeNewsTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/현대차/g, '현대자동차')
    .replace(/기아차/g, '기아')
    .replace(/\b(속보|단독|종합|영상|포토)\b/g, ' ')
    .replace(/[[\](){}]/g, ' ')
    .replace(/[^0-9a-z가-힣]+/g, '')
    .trim();
}

function titleVector(value: string): Map<string, number> {
  const normalized = normalizeNewsTitle(value);
  const vector = new Map<string, number>();
  if (!normalized) return vector;
  if (normalized.length === 1) {
    vector.set(normalized, 1);
    return vector;
  }
  for (let index = 0; index < normalized.length - 1; index++) {
    const gram = normalized.slice(index, index + 2);
    vector.set(gram, (vector.get(gram) ?? 0) + 1);
  }
  return vector;
}

export function newsTitleCosineSimilarity(a: string, b: string): number {
  const normalizedA = normalizeNewsTitle(a);
  const normalizedB = normalizeNewsTitle(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const vectorA = titleVector(normalizedA);
  const vectorB = titleVector(normalizedB);
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const count of vectorA.values()) magnitudeA += count * count;
  for (const count of vectorB.values()) magnitudeB += count * count;
  for (const [gram, count] of vectorA) {
    dot += count * (vectorB.get(gram) ?? 0);
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator > 0 ? dot / denominator : 0;
}

function parseDateKey(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);

  const match = String(value).match(
    /((?:20)?\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/,
  );
  if (!match) return null;
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

export function getNewsDateKey(item: DeduplicatableNewsItem): string | null {
  return (
    parseDateKey(item.publishedAt) ??
    parseDateKey(item.pubDate) ??
    parseDateKey(item.fetchedAt)
  );
}

function normalizeUrl(value?: string | null): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref') {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function areNewsItemsDuplicates(
  a: DeduplicatableNewsItem,
  b: DeduplicatableNewsItem,
  threshold = DEFAULT_NEWS_TITLE_COSINE_THRESHOLD,
): boolean {
  const urlA = normalizeUrl(a.url ?? a.link);
  const urlB = normalizeUrl(b.url ?? b.link);
  if (urlA && urlA === urlB) return true;

  const dateA = getNewsDateKey(a);
  const dateB = getNewsDateKey(b);
  if (dateA && dateB && dateA !== dateB) return false;

  const requiredThreshold =
    dateA && dateB ? threshold : UNKNOWN_DATE_TITLE_COSINE_THRESHOLD;
  return newsTitleCosineSimilarity(a.title, b.title) >= requiredThreshold;
}

function newsItemScore(item: DeduplicatableNewsItem): number {
  return (
    Number(Boolean(item.publishedAt || item.pubDate)) * 8 +
    Number(Boolean(item.snippet || item.description)) * 4 +
    Number(Boolean(item.imageUrl)) * 2
  );
}

export function deduplicateNewsItems<T extends DeduplicatableNewsItem>(
  items: T[],
  threshold = DEFAULT_NEWS_TITLE_COSINE_THRESHOLD,
): T[] {
  const result: T[] = [];
  const resultIndexesByDate = new Map<string, number[]>();
  const resultIndexByUrl = new Map<string, number>();

  for (const item of items) {
    const url = normalizeUrl(item.url ?? item.link);
    const dateKey = getNewsDateKey(item) ?? 'unknown';
    const candidateIndexes = resultIndexesByDate.get(dateKey) ?? [];
    const duplicateIndex =
      (url ? resultIndexByUrl.get(url) : undefined) ??
      candidateIndexes.find((index) =>
        areNewsItemsDuplicates(result[index], item, threshold),
      ) ??
      -1;
    if (duplicateIndex < 0) {
      const index = result.push(item) - 1;
      candidateIndexes.push(index);
      resultIndexesByDate.set(dateKey, candidateIndexes);
      if (url) resultIndexByUrl.set(url, index);
      continue;
    }

    const current = result[duplicateIndex];
    if (newsItemScore(item) > newsItemScore(current)) {
      const currentUrl = normalizeUrl(current.url ?? current.link);
      const currentDateKey = getNewsDateKey(current) ?? 'unknown';
      if (currentUrl && resultIndexByUrl.get(currentUrl) === duplicateIndex) {
        resultIndexByUrl.delete(currentUrl);
      }
      if (currentDateKey !== dateKey) {
        resultIndexesByDate.set(
          currentDateKey,
          (resultIndexesByDate.get(currentDateKey) ?? []).filter(
            (index) => index !== duplicateIndex,
          ),
        );
        candidateIndexes.push(duplicateIndex);
        resultIndexesByDate.set(dateKey, candidateIndexes);
      }
      result[duplicateIndex] = item;
      if (url) resultIndexByUrl.set(url, duplicateIndex);
    }
  }

  return result;
}

export function filterNewNewsItems<T extends DeduplicatableNewsItem>(
  existing: DeduplicatableNewsItem[],
  incoming: T[],
  threshold = DEFAULT_NEWS_TITLE_COSINE_THRESHOLD,
): T[] {
  const accepted: T[] = [];
  for (const item of incoming) {
    if (
      [...existing, ...accepted].some((candidate) =>
        areNewsItemsDuplicates(candidate, item, threshold),
      )
    ) {
      continue;
    }
    accepted.push(item);
  }
  return accepted;
}
