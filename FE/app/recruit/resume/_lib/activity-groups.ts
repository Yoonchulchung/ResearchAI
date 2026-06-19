import type {
  ResumeSearchExperienceItem,
  ResumeSearchPrizeItem,
} from "@/lib/api/resume";

export interface ExperienceGroup {
  id: string;
  key: string;
  items: ResumeSearchExperienceItem[];
}

export interface PrizeGroup {
  id: string;
  key: string;
  items: ResumeSearchPrizeItem[];
}

const STOPWORDS = new Set([
  "을", "를", "이", "가", "은", "는", "에", "의", "와", "과", "도", "로", "으로",
  "에서", "까지", "부터", "에게", "하여", "하고", "하며", "했다", "했습니다",
  "했으며", "하였", "하는", "했던", "하여서", "통해", "위해", "위한", "대한",
  "관련", "활동", "진행", "참여", "개발", "운영", "관리", "경험", "역할",
  "담당", "수행", "기여", "향상", "개선", "구현", "설계", "분석", "기획",
  "통한", "바탕", "중심", "통하여", "있는", "있었", "있어", "하였으며",
  "통하여", "하였습니다", "하였고", "되었", "됐다", "됩니다", "했으며",
  "통한", "대하여", "있었으며", "있습니다", "것을", "것이", "것으로",
  "등을", "등의", "등이", "에도", "에는", "에게서", "으로서", "로서",
]);

function tokenize(text: string): string[] {
  return text
    .replace(/\\n/g, " ")
    .replace(/\r?\n/g, " ")
    .toLowerCase()
    .replace(/[^\w가-힣]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  const intersection = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

function groupBySimilarity<T>(
  items: T[],
  getKey: (item: T) => string,
  threshold: number,
): T[][] {
  const tokenSets = items.map((item) => tokenize(getKey(item)));
  const assigned = new Array<boolean>(items.length).fill(false);
  const groups: number[][] = [];

  for (let i = 0; i < items.length; i++) {
    if (assigned[i]) continue;
    const group = [i];
    assigned[i] = true;
    for (let j = i + 1; j < items.length; j++) {
      if (assigned[j]) continue;
      if (jaccardSimilarity(tokenSets[i], tokenSets[j]) >= threshold) {
        group.push(j);
        assigned[j] = true;
      }
    }
    groups.push(group);
  }

  return groups.map((indices) => indices.map((i) => items[i]));
}

export function groupExperiences(
  experiences: ResumeSearchExperienceItem[],
): ExperienceGroup[] {
  // 본문(description) 기준 그루핑 — 없으면 organizationName 으로 fallback
  const raw = groupBySimilarity(
    experiences,
    (item) => item.description?.trim() || item.organizationName,
    0.35,
  );
  return raw.map((items, i) => ({
    id: `exp-g-${i}`,
    key: items[0]?.organizationName ?? "",
    items,
  }));
}

export function groupPrizes(prizes: ResumeSearchPrizeItem[]): PrizeGroup[] {
  const raw = groupBySimilarity(prizes, (item) => item.title, 0.45);
  return raw.map((items, i) => ({
    id: `prize-g-${i}`,
    key: items[0]?.title ?? "",
    items,
  }));
}

const CATEGORY_KEYWORDS: Record<string, "experience" | "prize"> = {
  수상: "prize",
  수상내역: "prize",
  상: "prize",
  학내외활동: "experience",
  활동: "experience",
  학내외: "experience",
  학내활동: "experience",
  외부활동: "experience",
};

export function detectCategoryFilter(
  q: string,
): "experience" | "prize" | null {
  const normalized = q.trim().replace(/\s+/g, "");
  return CATEGORY_KEYWORDS[normalized] ?? null;
}
