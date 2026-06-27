import { Injectable } from '@nestjs/common';
import { AiLeaderboardEntryEntity } from 'src/news/domain/ai-leaderboard/entity/ai-leaderboard-entry.entity';
import {
  AiModelEntry,
  LeaderboardSortDir,
} from 'src/news/application/ai-leaderboard/ai-leaderboard.types';

@Injectable()
export class AiLeaderboardEntryMapper {
  toModel(entity: AiLeaderboardEntryEntity): AiModelEntry {
    const benchmarks = this.parseScores(entity.benchmarksJson);
    const sourceScores = this.parseScores(entity.sourceScoresJson);

    return {
      id: entity.id,
      fullname: entity.fullname,
      org: entity.org,
      modelName: entity.modelName,
      rank: entity.rank,
      category: entity.category ?? 'llm',
      average: entity.average,
      ifeval: entity.ifeval,
      bbh: entity.bbh,
      mathLvl5: entity.mathLvl5,
      gpqa: entity.gpqa,
      musr: entity.musr,
      mmluPro: entity.mmluPro,
      params: entity.params,
      architecture: entity.architecture,
      modelType: entity.modelType,
      license: entity.license,
      likes: entity.likes,
      fetchedAt: entity.fetchedAt,
      benchmarks,
      sourceScores,
      sourceCount:
        entity.sourceCount ??
        Object.values(sourceScores).filter((value) => value != null).length,
    };
  }

  compare(
    left: AiModelEntry,
    right: AiModelEntry,
    sortBy: string,
    sortDir: LeaderboardSortDir,
  ): number {
    const direction = sortDir === 'desc' ? -1 : 1;
    const leftValue = this.sortValue(left, sortBy);
    const rightValue = this.sortValue(right, sortBy);

    if (leftValue == null && rightValue == null) return left.rank - right.rank;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    if (typeof leftValue === 'string' || typeof rightValue === 'string') {
      const result = String(leftValue).localeCompare(String(rightValue), 'ko');
      return result === 0 ? left.rank - right.rank : result * direction;
    }

    const result =
      leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
    return result === 0 ? left.rank - right.rank : result * direction;
  }

  private sortValue(
    entry: AiModelEntry,
    sortBy: string,
  ): string | number | null {
    switch (sortBy) {
      case 'rank':
        return entry.rank;
      case 'model':
      case 'modelName':
        return entry.modelName || entry.fullname;
      case 'org':
        return entry.org;
      case 'average':
        return entry.average;
      case 'params':
        return entry.params;
      case 'likes':
        return entry.likes;
      case 'sourceCount':
        return entry.sourceCount;
      case 'type':
      case 'modelType':
        return entry.modelType;
      default: {
        const directValue = (entry as unknown as Record<string, unknown>)[
          sortBy
        ];
        if (
          typeof directValue === 'number' ||
          typeof directValue === 'string'
        ) {
          return directValue;
        }
        return entry.benchmarks[sortBy] ?? null;
      }
    }
  }

  private parseScores(value: string): Record<string, number | null> {
    try {
      return JSON.parse(value || '{}') as Record<string, number | null>;
    } catch {
      return {};
    }
  }
}
