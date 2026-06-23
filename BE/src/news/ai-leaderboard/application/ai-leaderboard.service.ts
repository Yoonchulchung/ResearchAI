import { Injectable } from '@nestjs/common';
import { AiLeaderboardQueryService } from 'src/news/ai-leaderboard/application/ai-leaderboard-query.service';
import {
  AiModelEntry,
  LeaderboardQuery,
  LeaderboardResult,
} from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

export {
  CATEGORY_BENCHMARK_DEFS,
  CATEGORY_LABELS,
  CATEGORY_SCORE_LABEL,
} from 'src/news/ai-leaderboard/application/ai-leaderboard.types';
export type {
  AiModelEntry,
  LeaderboardQuery,
  LeaderboardResult,
  LeaderboardSortDir,
} from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

/**
 * AI 리더보드 애플리케이션 파사드.
 * 컨트롤러는 이 클래스만 의존하고 조회·갱신 책임은 내부 객체에 위임한다.
 */
@Injectable()
export class AiLeaderboardService {
  constructor(private readonly queryService: AiLeaderboardQueryService) {}

  getLeaderboard(options: LeaderboardQuery = {}): Promise<LeaderboardResult> {
    return this.queryService.getLeaderboard(options);
  }

  getTopN(n = 5, category = 'llm'): Promise<AiModelEntry[]> {
    return this.queryService.getTopN(n, category);
  }

  getTopPerCategory(nPerCategory = 1) {
    return this.queryService.getTopPerCategory(nPerCategory);
  }

  getById(id: string): Promise<AiModelEntry | null> {
    return this.queryService.getById(id);
  }
}
