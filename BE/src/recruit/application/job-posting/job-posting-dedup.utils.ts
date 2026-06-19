export interface DeadlineTitlePosting {
  id: string;
  title: string;
  deadline?: string | null;
  endDate?: string | null;
  collectedAt?: string | null;
  favorite?: boolean;
  appliedAt?: string | null;
  detailContent?: string | null;
  detailHtml?: string | null;
}

const DEFAULT_TITLE_COSINE_THRESHOLD = 0.88;

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[[\](){}]/g, ' ')
    .replace(/채용|모집|공고/g, ' ')
    .replace(/[^0-9a-z가-힣]+/g, '')
    .trim();
}

function titleVector(value: string): Map<string, number> {
  const normalized = normalizeTitle(value);
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

export function titleCosineSimilarity(a: string, b: string): number {
  const normalizedA = normalizeTitle(a);
  const normalizedB = normalizeTitle(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  const vectorA = titleVector(normalizedA);
  const vectorB = titleVector(normalizedB);
  return vectorCosineSimilarity(vectorA, vectorB);
}

function vectorCosineSimilarity(vectorA: Map<string, number>, vectorB: Map<string, number>): number {
  let dot = 0, magnitudeA = 0, magnitudeB = 0;
  for (const count of vectorA.values()) magnitudeA += count * count;
  for (const count of vectorB.values()) magnitudeB += count * count;
  for (const [gram, count] of vectorA) dot += count * (vectorB.get(gram) ?? 0);
  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator > 0 ? dot / denominator : 0;
}

export function getPostingDeadlineKey(
  posting: Pick<DeadlineTitlePosting, 'deadline' | 'endDate'>,
): string | null {
  const raw = `${posting.endDate ?? ''} ${posting.deadline ?? ''}`.trim();
  if (!raw) return null;
  const dateMatch = raw.match(/((?:20)?\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (dateMatch) {
    const year = dateMatch[1].length === 2 ? `20${dateMatch[1]}` : dateMatch[1];
    return `date:${year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
  }
  const dDayMatch = raw.match(/\bD\s*([+-])\s*(\d+)\b/i);
  if (dDayMatch) return `dday:${dDayMatch[1]}${Number(dDayMatch[2])}`;
  if (/오늘\s*마감|금일\s*마감/i.test(raw)) return 'dday:-0';
  if (/내일\s*마감/i.test(raw)) return 'dday:-1';
  if (/상시|수시|채용\s*시/i.test(raw)) return 'always';
  return null;
}

function preferredPosting<T extends DeadlineTitlePosting>(items: T[]): T {
  return [...items].sort((a, b) => {
    const score = (item: T) =>
      Number(Boolean(item.appliedAt)) * 8 +
      Number(Boolean(item.favorite)) * 4 +
      Number(Boolean(item.detailContent || item.detailHtml)) * 2;
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.collectedAt ?? '').localeCompare(a.collectedAt ?? '');
  })[0];
}

export function deduplicatePostingsByDeadlineAndTitle<T extends DeadlineTitlePosting>(
  postings: T[],
  threshold = DEFAULT_TITLE_COSINE_THRESHOLD,
): T[] {
  if (postings.length <= 1) return postings;

  const groups = new Map<string, T[]>();
  const withoutDeadline: T[] = [];

  for (const posting of postings) {
    const deadlineKey = getPostingDeadlineKey(posting);
    if (!deadlineKey) { withoutDeadline.push(posting); continue; }
    const group = groups.get(deadlineKey) ?? [];
    group.push(posting);
    groups.set(deadlineKey, group);
  }

  const deduplicated: T[] = [...withoutDeadline];

  for (const group of groups.values()) {
    if (group.length === 1) { deduplicated.push(group[0]); continue; }

    const parent = group.map((_, index) => index);
    const normalizedTitles = group.map((posting) => normalizeTitle(posting.title));
    const vectors = normalizedTitles.map((title) => titleVector(title));
    const find = (index: number): number =>
      parent[index] === index ? index : (parent[index] = find(parent[index]));
    const union = (left: number, right: number) => { parent[find(left)] = find(right); };

    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) {
        const similarity =
          normalizedTitles[left] && normalizedTitles[left] === normalizedTitles[right]
            ? 1
            : vectorCosineSimilarity(vectors[left], vectors[right]);
        if (similarity >= threshold) union(left, right);
      }
    }

    const clusters = new Map<number, T[]>();
    for (let index = 0; index < group.length; index++) {
      const root = find(index);
      const cluster = clusters.get(root) ?? [];
      cluster.push(group[index]);
      clusters.set(root, cluster);
    }
    for (const cluster of clusters.values()) deduplicated.push(preferredPosting(cluster));
  }

  return deduplicated;
}
