const LEGAL_DESIGNATOR_RE =
  /\(주\)|（주）|㈜|\(유\)|（유）|㈔|주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/gi;

/**
 * 이름이 한국어(한글) 문자를 포함하지 않는 순수 영문/ASCII 이름인지 판별.
 * 이 경우 englishName 컬럼으로 취급한다.
 */
export function isAsciiCompanyName(name: string): boolean {
  const stripped = name.replace(LEGAL_DESIGNATOR_RE, '').trim();
  return stripped.length > 0 && !/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(stripped);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function expandBrandAliasCandidates(name: string): string[] {
  const values = [name];
  const imToHangul = name.replace(/\bim(?=[가-힣])/gi, '아이엠');
  if (imToHangul !== name) values.push(imToHangul);
  const hangulToIm = name.replace(/아이엠(?=[가-힣])/g, 'iM');
  if (hangulToIm !== name) values.push(hangulToIm);
  return values;
}

export function stripCompanyLegalDesignators(name: string): string {
  const stripped = name
    .replace(LEGAL_DESIGNATOR_RE, '')
    .replace(/[\s()（）\[\]]/g, '')
    .trim();
  return stripped || name.trim();
}

export function normalizeCompanyNameForMatch(name: string): string {
  const normalized = stripCompanyLegalDesignators(name)
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
  return normalized.replace(/^im(?=[가-힣])/, '아이엠');
}

export function buildCompanyNameSearchCandidates(name: string): string[] {
  const original = name.trim().replace(/\s+/g, ' ');
  const baseCandidates = expandBrandAliasCandidates(
    stripCompanyLegalDesignators(original),
  ).map((base) => base.replace(/\s+/g, ''));

  const variants = baseCandidates.flatMap((compactBase) => [
    compactBase,
    `㈜${compactBase}`,
    `(주)${compactBase}`,
    `주식회사 ${compactBase}`,
    `${compactBase} 주식회사`,
  ]);

  return unique([original, ...variants]);
}

export function buildCompanySearchQuery(name: string, suffix: string): string {
  const terms = buildCompanyNameSearchCandidates(name)
    .slice(0, 6)
    .map((candidate) => `"${candidate.replace(/"/g, '')}"`);
  const nameQuery = terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0];
  return `${nameQuery} ${suffix}`;
}

export function isCompanyNameMatch(query: string, candidate: string): boolean {
  const q = normalizeCompanyNameForMatch(query);
  const c = normalizeCompanyNameForMatch(candidate);
  if (!q || !c) return false;
  return c === q || c.startsWith(q) || q.startsWith(c) || c.includes(q);
}
