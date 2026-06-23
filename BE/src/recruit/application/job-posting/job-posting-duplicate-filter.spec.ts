import {
  filterDuplicatePostingsByDeadlineAndTitle,
  getPostingDeadlineKey,
  titleCosineSimilarity,
} from './job-posting-duplicate-filter';

describe('job posting duplicate filter', () => {
  it('extracts date and D-day deadline keys', () => {
    expect(
      getPostingDeadlineKey({
        deadline: '2026.06.30 · D-11',
        endDate: null,
      }),
    ).toBe('date:2026-06-30');
    expect(getPostingDeadlineKey({ deadline: 'D-11', endDate: null })).toBe(
      'dday:-11',
    );
  });

  it('gives nearly identical titles a high cosine score', () => {
    expect(
      titleCosineSimilarity(
        '[신입/경력] 백엔드 개발자 채용',
        '백엔드 개발자 모집 (신입·경력)',
      ),
    ).toBeGreaterThanOrEqual(0.88);
  });

  it('removes similar titles only when the deadline key matches', () => {
    const items = [
      {
        id: 'a',
        title: '[신입/경력] 백엔드 개발자 채용',
        deadline: 'D-7',
        collectedAt: '2026-06-18T00:00:00.000Z',
      },
      {
        id: 'b',
        title: '백엔드 개발자 모집 (신입·경력)',
        deadline: 'D-7',
        collectedAt: '2026-06-19T00:00:00.000Z',
      },
      {
        id: 'c',
        title: '백엔드 개발자 모집 (신입·경력)',
        deadline: 'D-8',
        collectedAt: '2026-06-19T00:00:00.000Z',
      },
    ];

    const result = filterDuplicatePostingsByDeadlineAndTitle(items);
    expect(result.map((item) => item.id)).toEqual(
      expect.arrayContaining(['b', 'c']),
    );
    expect(result).toHaveLength(2);
  });
});
