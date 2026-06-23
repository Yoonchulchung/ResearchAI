import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiLeaderboardEntryEntity } from 'src/news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { AiLeaderboardRefreshService } from 'src/news/ai-leaderboard/application/ai-leaderboard-refresh.service';
import { AiLeaderboardEntryMapper } from 'src/news/ai-leaderboard/application/ai-leaderboard-entry.mapper';
import {
  AiModelEntry,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  LeaderboardQuery,
  LeaderboardResult,
} from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

@Injectable()
export class AiLeaderboardQueryService {
  constructor(
    @InjectRepository(AiLeaderboardEntryEntity)
    private readonly repository: Repository<AiLeaderboardEntryEntity>,
    private readonly refreshService: AiLeaderboardRefreshService,
    private readonly mapper: AiLeaderboardEntryMapper,
  ) {}

  async getLeaderboard(
    options: LeaderboardQuery = {},
  ): Promise<LeaderboardResult> {
    const category = options.category ?? 'llm';
    await this.ensureData(category, options.refresh === true);

    let query = this.repository
      .createQueryBuilder('entry')
      .where('entry.category = :category', { category });
    if (options.type) {
      query = query.andWhere('entry.modelType = :type', {
        type: options.type,
      });
    }
    if (options.maxParams != null) {
      query = query.andWhere('entry.params <= :maxParams', {
        maxParams: options.maxParams,
      });
    }
    if (options.minParams != null) {
      query = query.andWhere('entry.params >= :minParams', {
        minParams: options.minParams,
      });
    }

    const total = await query.clone().getCount();
    const entities = await query.getMany();
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;
    const entries = entities
      .map((entity) => this.mapper.toModel(entity))
      .sort((left, right) =>
        this.mapper.compare(
          left,
          right,
          options.sortBy ?? 'rank',
          options.sortDir ?? 'asc',
        ),
      )
      .slice(offset, offset + limit);

    return {
      entries,
      total,
      fetchedAt: entities[0]?.fetchedAt ?? null,
      category,
    };
  }

  async getTopN(n = 5, category = 'llm'): Promise<AiModelEntry[]> {
    await this.ensureData(category, false);
    const entities = await this.repository.find({
      where: { category },
      order: { rank: 'ASC' },
      take: n,
    });
    return entities.map((entity) => this.mapper.toModel(entity));
  }

  async getTopPerCategory(
    nPerCategory = 1,
  ): Promise<{ category: string; label: string; entries: AiModelEntry[] }[]> {
    const results = await Promise.all(
      ALL_CATEGORIES.map(async (category) => {
        const entities = await this.repository.find({
          where: { category },
          order: { rank: 'ASC' },
          take: nPerCategory,
        });
        return {
          category,
          label: CATEGORY_LABELS[category] ?? category,
          entries: entities.map((entity) => this.mapper.toModel(entity)),
        };
      }),
    );
    return results.filter((result) => result.entries.length > 0);
  }

  async getById(id: string): Promise<AiModelEntry | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.mapper.toModel(entity) : null;
  }

  private async ensureData(
    category: string,
    forceRefresh: boolean,
  ): Promise<void> {
    const count = await this.repository.count({ where: { category } });
    if (forceRefresh || count === 0) {
      await this.refreshService.refresh();
      return;
    }
    void this.refreshService.refreshIfStale();
  }
}
