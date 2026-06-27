import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  AiLeaderboardService,
  CATEGORY_LABELS,
  CATEGORY_BENCHMARK_DEFS,
  CATEGORY_SCORE_LABEL,
} from 'src/news/application/ai-leaderboard/ai-leaderboard.service';

@Controller('ai-leaderboard')
export class AiLeaderboardController {
  constructor(private readonly service: AiLeaderboardService) {}

  @Get('meta')
  getMeta() {
    return {
      categories: CATEGORY_LABELS,
      benchmarks: CATEGORY_BENCHMARK_DEFS,
      scoreLabels: CATEGORY_SCORE_LABEL,
    };
  }

  @Get('top')
  getTop(@Query('n') nStr = '5', @Query('category') category = 'llm') {
    const n = Math.min(Math.max(parseInt(nStr, 10) || 5, 1), 20);
    return this.service.getTopN(n, category);
  }

  @Get('top-per-category')
  getTopPerCategory(@Query('n') nStr = '1') {
    const n = Math.min(Math.max(parseInt(nStr, 10) || 1, 1), 5);
    return this.service.getTopPerCategory(n);
  }

  @Get()
  getLeaderboard(
    @Query('limit') limitStr = '50',
    @Query('offset') offsetStr = '0',
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('maxParams') maxParamsStr?: string,
    @Query('minParams') minParamsStr?: string,
    @Query('refresh') refreshStr = 'false',
    @Query('sortBy') sortBy = 'rank',
    @Query('sortDir') sortDir = 'asc',
  ) {
    return this.service.getLeaderboard({
      limit: parseInt(limitStr, 10) || 50,
      offset: parseInt(offsetStr, 10) || 0,
      category: category || 'llm',
      type: type || undefined,
      maxParams: maxParamsStr ? parseFloat(maxParamsStr) : undefined,
      minParams: minParamsStr ? parseFloat(minParamsStr) : undefined,
      refresh: refreshStr === 'true',
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : 'asc',
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const entry = await this.service.getById(decodeURIComponent(id));
    if (!entry) throw new NotFoundException('모델을 찾을 수 없습니다.');
    return entry;
  }
}
