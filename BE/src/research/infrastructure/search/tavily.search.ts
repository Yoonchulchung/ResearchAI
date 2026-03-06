import { tavily } from '@tavily/core';

/**
 * 채용공고 사이트(잡코리아, 사람인, 원티드 등) Tavily 크롤링 결과에서
 * AI 컨텍스트에 불필요한 UI/네비게이션 노이즈를 제거한다.
 */
export function cleanJobBoardContent(content: string): string {
  let s = content;

  // 잡코리아 사이트 네비게이션 블록 (JOBKOREA ~ 기업 서비스 ~ 총 N건)
  s = s.replace(/JOBKOREA\s+인기검색어[\s\S]*?기업 서비스\s*\n+총 \d+건\s*\n?/g, '');

  // 독립적으로 나타나는 인기검색어 섹션 (1사무\n2영업관리\n... 패턴)
  s = s.replace(/인기검색어\s*\n(?:\d+\S*\s*\n)*/g, '');

  // 회원가입/로그인, 기업 서비스 단독 라인
  s = s.replace(/^회원가입\/로그인\s*$/gm, '');
  s = s.replace(/^기업 서비스\s*$/gm, '');

  // 총 N건 단독 라인
  s = s.replace(/^총 \d+건\s*$/gm, '');

  // 회사 로고 라인 (예: "크림(주) 로고", "㈜XXX 로고")
  s = s.replace(/^.{1,50}\s+로고\s*$/gm, '');

  // 배지/홍보 문구 단독 라인
  s = s.replace(/^(합격축하금\s+\d+만원|믿고보는 대기업|신입 지원 가능|재택\/원격근무 가능|오늘 마감!.*)$/gm, '');

  // 등록일 · 마감일 라인 (예: "02/26(목) 등록•03/30(월) 마감", "01/28(수) 등록•상시채용")
  s = s.replace(/^\d{2}\/\d{2}\(\w+\)\s+등록[•·].+$/gm, '');

  // 경력 조건 뒤 쉼표 3개+ 복지 혜택 목록 제거 (예: "경력3년↑•경조사 지원, 유연근무, ...")
  // 쉼표 2개 이하(재택근무 등 단순 정보)는 유지
  s = s.replace(/(경력[^•·\n]*)[•·]([^,\n]*,[^,\n]*,[^,\n]+)/g, '$1');

  // "비슷한 채용 공고" 이후 섹션 전부 제거 (페이지 하단 관련 공고 목록)
  s = s.replace(/비슷한 채용 공고[\s\S]*/g, '');

  // 출처: URL 라인 (searchTavily에서 추가된 URL 또는 페이지 내 출처 표기)
  s = s.replace(/^출처: https?:\/\/\S+\s*$/gm, '');

  // 3줄 이상 연속 빈 줄 → 2줄로
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

export async function searchTavily(query: string): Promise<string> {
  const depth = (process.env.TAVILY_SEARCH_DEPTH || 'basic') as 'basic' | 'advanced';
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  const response = await client.search(query, { searchDepth: depth, maxResults: 5 });
  return (
    response.results
      .map((r) => `[${r.title}]\n${cleanJobBoardContent(r.content)}\n출처: ${r.url}`)
      .join('\n\n') ?? ''
  );
}

/** light search 전용 — URL 제외, 노이즈 정리 */
export async function searchTavilyLight(query: string): Promise<string> {
  const depth = (process.env.TAVILY_SEARCH_DEPTH || 'basic') as 'basic' | 'advanced';
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  const response = await client.search(query, { searchDepth: depth, maxResults: 5 });
  return (
    response.results
      .map((r) => `[${r.title}]\n${cleanJobBoardContent(r.content)}`)
      .join('\n\n') ?? ''
  );
}
