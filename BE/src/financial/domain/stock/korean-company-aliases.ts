/**
 * 한국어 회사명(닉네임) → Yahoo Finance 심볼 매핑
 * 서학개미 주요 종목 위주로 구성
 */
export const KOREAN_ALIASES: Record<string, string[]> = {
  // 반도체
  마이크론: ['MU'],
  엔비디아: ['NVDA'],
  인텔: ['INTC'],
  AMD: ['AMD'],
  에이엠디: ['AMD'],
  퀄컴: ['QCOM'],
  브로드컴: ['AVGO'],
  텍사스인스트루먼트: ['TXN'],
  텍사스인스트루먼츠: ['TXN'],
  마이크로칩테크놀로지: ['MCHP'],
  TSMC: ['TSM'],
  에이에스엠엘: ['ASML'],
  ASML: ['ASML'],
  아날로그디바이스: ['ADI'],
  온세미컨덕터: ['ON'],
  램리서치: ['LRCX'],
  케이엘에이: ['KLAC'],
  어플라이드머티리얼즈: ['AMAT'],
  // 빅테크
  애플: ['AAPL'],
  마이크로소프트: ['MSFT'],
  구글: ['GOOGL', 'GOOG'],
  알파벳: ['GOOGL', 'GOOG'],
  아마존: ['AMZN'],
  메타: ['META'],
  페이스북: ['META'],
  넷플릭스: ['NFLX'],
  // EV·자동차
  테슬라: ['TSLA'],
  리비안: ['RIVN'],
  루시드: ['LCID'],
  포드: ['F'],
  // AI·소프트웨어
  팔란티어: ['PLTR'],
  세일즈포스: ['CRM'],
  서비스나우: ['NOW'],
  워크데이: ['WDAY'],
  스노우플레이크: ['SNOW'],
  데이터독: ['DDOG'],
  몽고DB: ['MDB'],
  클라우드플레어: ['NET'],
  오라클: ['ORCL'],
  어도비: ['ADBE'],
  인튜이트: ['INTU'],
  오토데스크: ['ADSK'],
  // 금융
  JP모건: ['JPM'],
  골드만삭스: ['GS'],
  모건스탠리: ['MS'],
  뱅크오브아메리카: ['BAC'],
  웰스파고: ['WFC'],
  비자: ['V'],
  마스터카드: ['MA'],
  페이팔: ['PYPL'],
  코인베이스: ['COIN'],
  // 헬스케어
  존슨앤드존슨: ['JNJ'],
  화이자: ['PFE'],
  모더나: ['MRNA'],
  일라이릴리: ['LLY'],
  암젠: ['AMGN'],
  // 소비재·유통
  월마트: ['WMT'],
  코스트코: ['COST'],
  홈디포: ['HD'],
  스타벅스: ['SBUX'],
  맥도날드: ['MCD'],
  나이키: ['NKE'],
  // 에너지
  엑슨모빌: ['XOM'],
  셰브론: ['CVX'],
  // 우주·방산
  스페이스엑스: ['RKLB'],
  록히드마틴: ['LMT'],
  보잉: ['BA'],
  // 기타
  줌: ['ZM'],
  우버: ['UBER'],
  에어비앤비: ['ABNB'],
  도어대시: ['DASH'],
  스포티파이: ['SPOT'],
  로블록스: ['RBLX'],
  유니티: ['U'],
  트레이드데스크: ['TTD'],
  버크셔해서웨이: ['BRK-B'],
  코카콜라: ['KO'],
  펩시: ['PEP'],
  디즈니: ['DIS'],
};

/** 한글 포함 여부 확인 */
export function hasKorean(text: string): boolean {
  return /[가-힣ᄀ-ᇿ㄰-㆏]/.test(text);
}

/**
 * 한국어 쿼리와 부분 매칭되는 심볼 목록 반환
 * "마이크론테크" → "마이크론" 키와 매칭
 */
export function resolveKoreanAliases(query: string): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const symbols: string[] = [];
  for (const [alias, syms] of Object.entries(KOREAN_ALIASES)) {
    const key = alias.toLowerCase().replace(/\s+/g, '');
    if (key.includes(q) || q.includes(key)) {
      symbols.push(...syms);
    }
  }
  return [...new Set(symbols)];
}
