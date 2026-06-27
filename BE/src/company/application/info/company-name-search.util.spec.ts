import {
  buildCompanyNameSearchCandidates,
  buildCompanySearchQuery,
  isAsciiCompanyName,
  isCompanyNameMatch,
  normalizeCompanyNameForMatch,
  stripCompanyLegalDesignators,
} from './company-name-search.util';

describe('company name search utilities', () => {
  it('builds legal-designator variants for bare Korean company names', () => {
    expect(buildCompanyNameSearchCandidates('가나다')).toEqual([
      '가나다',
      '㈜가나다',
      '(주)가나다',
      '주식회사 가나다',
      '가나다 주식회사',
    ]);
  });

  it('normalizes legal designators for matching', () => {
    expect(stripCompanyLegalDesignators('㈜가나다')).toBe('가나다');
    expect(normalizeCompanyNameForMatch('(주) 가나다')).toBe('가나다');
    expect(isCompanyNameMatch('가나다', '㈜가나다')).toBe(true);
    expect(isCompanyNameMatch('주식회사 가나다', '가나다')).toBe(true);
    expect(isCompanyNameMatch('가나다', '㈜가나다 기업정보 - 잡코리아')).toBe(
      true,
    );
  });

  it('matches mixed latin brand names against Hangul aliases', () => {
    expect(buildCompanyNameSearchCandidates('iM테크')).toContain('아이엠테크');
    expect(
      isCompanyNameMatch('iM테크', '㈜아이엠테크 기업정보 - 잡코리아'),
    ).toBe(true);
  });

  it('detects ASCII-only company names as English', () => {
    expect(isAsciiCompanyName('Naver')).toBe(true);
    expect(isAsciiCompanyName('KAKAO')).toBe(true);
    expect(isAsciiCompanyName('㈜Naver')).toBe(true);
    expect(isAsciiCompanyName('네이버')).toBe(false);
    expect(isAsciiCompanyName('iM테크')).toBe(false);
  });

  it('builds a broad quoted search query', () => {
    expect(
      buildCompanySearchQuery('가나다', 'site:jobkorea.co.kr 기업정보'),
    ).toBe(
      '("가나다" OR "㈜가나다" OR "(주)가나다" OR "주식회사 가나다" OR "가나다 주식회사") site:jobkorea.co.kr 기업정보',
    );
  });
});
