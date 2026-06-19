import {
  areNewsItemsDuplicates,
  deduplicateNewsItems,
  newsTitleCosineSimilarity,
} from './news-dedup.utils';

describe('news title/date deduplication', () => {
  it('scores slightly rewritten headlines as similar', () => {
    expect(
      newsTitleCosineSimilarity(
        '현대차, 남극에 그린수소 그리드 구축',
        '현대자동차 남극 그린수소 그리드 구축 추진',
      ),
    ).toBeGreaterThanOrEqual(0.84);
  });

  it('requires matching dates for ordinary similar headlines', () => {
    expect(
      areNewsItemsDuplicates(
        {
          title: '삼성전자 AI 반도체 신제품 공개',
          publishedAt: '2026-06-18T10:00:00Z',
        },
        {
          title: '삼성전자, AI 반도체 신제품 공개',
          publishedAt: '2026-06-19T10:00:00Z',
        },
      ),
    ).toBe(false);
  });

  it('deduplicates same-day headlines from different URLs', () => {
    const result = deduplicateNewsItems([
      {
        title: '현대차, 남극에 그린수소 그리드 구축',
        url: 'https://a.example/news/1',
        publishedAt: '2026-06-18T10:00:00Z',
      },
      {
        title: '현대자동차 남극 그린수소 그리드 구축 추진',
        url: 'https://b.example/article/2',
        publishedAt: '2026-06-18T12:00:00Z',
        snippet: '상세 기사 요약',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://b.example/article/2');
  });
});
