export const FEED_CATEGORIES = [
  { id: "it", label: "IT" },
  { id: "economy", label: "경제" },
  { id: "science", label: "과학" },
  { id: "world", label: "세계" },
  { id: "github", label: "GitHub" },
  { id: "huggingface", label: "Hugging Face" },
] as const;

export type FeedCategory = typeof FEED_CATEGORIES[number]["id"];

const TECH_BLOG_SEARCH_SOURCES = [
  { id: "naver-place", keywords: ["네이버 플레이스", "naver place", "플레이스"] },
  { id: "naver-d2", keywords: ["네이버 d2", "naver d2", "네이버", "naver"] },
  { id: "kakao-tech", keywords: ["카카오 테크", "카카오 기술", "kakao tech", "카카오"] },
  { id: "kakaopay", keywords: ["카카오페이", "kakaopay", "kakao pay"] },
  { id: "banksalad", keywords: ["뱅크샐러드", "banksalad", "뱅샐"] },
  { id: "toss", keywords: ["토스", "toss"] },
  { id: "line", keywords: ["라인", "line"] },
  { id: "woowa", keywords: ["우아한형제들", "우아한", "배민", "woowa"] },
  { id: "daangn", keywords: ["당근", "당근마켓", "daangn"] },
  { id: "kurly", keywords: ["컬리", "마켓컬리", "kurly"] },
  { id: "hyundai-autoever", keywords: ["현대오토에버", "autoever", "오토에버"] },
  { id: "hyundai", keywords: ["현대자동차", "hyundai"] },
  { id: "google-developers", keywords: ["구글 개발자", "google developers", "google developer"] },
  { id: "google-ai", keywords: ["구글 ai", "google ai"] },
  { id: "github", keywords: ["깃허브", "github"] },
  { id: "openai", keywords: ["오픈ai", "openai"] },
  { id: "anthropic", keywords: ["앤트로픽", "anthropic"] },
  { id: "meta-ai", keywords: ["메타 ai", "meta ai"] },
  { id: "meta", keywords: ["메타", "meta"] },
  { id: "microsoft", keywords: ["마이크로소프트", "microsoft"] },
  { id: "aws-blog", keywords: ["aws", "아마존 aws"] },
  { id: "amazon-science", keywords: ["아마존 사이언스", "amazon science"] },
  { id: "netflix", keywords: ["넷플릭스", "netflix"] },
  { id: "spotify", keywords: ["스포티파이", "spotify"] },
  { id: "airbnb", keywords: ["에어비앤비", "airbnb"] },
] as const;

export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findTechBlogSourceId(query: string): string | null {
  const normalized = normalizeSearchText(query);
  for (const source of TECH_BLOG_SEARCH_SOURCES) {
    if (source.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return source.id;
    }
  }
  return null;
}

export function cleanSearchKeyword(query: string) {
  return query
    .replace(/기술\s*블로그/g, " ")
    .replace(/블로그/g, " ")
    .replace(/논문/g, " ")
    .replace(/뉴스/g, " ")
    .replace(/피드/g, " ")
    .replace(/찾아줘|찾아 줘|검색해줘|검색해 줘|검색|보여줘|보여 줘|알려줘|알려 줘/g, " ")
    .replace(/의|에\s*대한|관련|에서/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferFeedCategory(query: string): FeedCategory {
  const normalized = normalizeSearchText(query);
  if (normalized.includes("경제") || normalized.includes("주가") || normalized.includes("환율")) return "economy";
  if (normalized.includes("과학") || normalized.includes("science")) return "science";
  if (normalized.includes("세계") || normalized.includes("해외") || normalized.includes("world")) return "world";
  if (normalized.includes("github") || normalized.includes("깃허브")) return "github";
  if (normalized.includes("hugging") || normalized.includes("허깅페이스")) return "huggingface";
  return "it";
}
