import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiLeaderboardEntryEntity } from 'src/news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { AiLeaderboardScoreService } from 'src/news/ai-leaderboard/application/ai-leaderboard-score.service';
import {
  ALL_CATEGORIES,
  NormalizedLeaderboardEntry,
} from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

@Injectable()
export class AiLeaderboardStoreService {
  constructor(
    @InjectRepository(AiLeaderboardEntryEntity)
    private readonly repository: Repository<AiLeaderboardEntryEntity>,
    private readonly scores: AiLeaderboardScoreService,
  ) {}

  async needsRefresh(maxAgeMs: number): Promise<boolean> {
    const counts = await Promise.all(
      ALL_CATEGORIES.map((category) =>
        this.repository.count({ where: { category } }),
      ),
    );
    if (counts.some((count) => count === 0)) return true;

    const newest = await this.repository.findOne({
      where: {},
      order: { updatedAt: 'DESC' },
    });
    return (
      !newest || Date.now() - new Date(newest.updatedAt).getTime() >= maxAgeMs
    );
  }

  async save(
    entries: NormalizedLeaderboardEntry[],
    category: string,
  ): Promise<void> {
    if (!entries.length) return;

    const fetchedAt = new Date().toISOString();
    const rankedEntries = this.scores.rank(entries);
    const chunkSize = 200;

    for (let offset = 0; offset < rankedEntries.length; offset += chunkSize) {
      const entities = rankedEntries
        .slice(offset, offset + chunkSize)
        .map((entry, index) => {
          const sourceScores = entry.sourceScores ?? {};
          return this.repository.create({
            id: entry.id,
            fullname: entry.fullname,
            org: entry.org,
            modelName: entry.modelName,
            category,
            rank: offset + index + 1,
            average: entry.average,
            ifeval:
              category === 'llm' ? (entry.benchmarks.ifeval ?? null) : null,
            bbh: category === 'llm' ? (entry.benchmarks.bbh ?? null) : null,
            mathLvl5:
              category === 'llm' ? (entry.benchmarks.mathLvl5 ?? null) : null,
            gpqa: category === 'llm' ? (entry.benchmarks.gpqa ?? null) : null,
            musr: category === 'llm' ? (entry.benchmarks.musr ?? null) : null,
            mmluPro:
              category === 'llm' ? (entry.benchmarks.mmluPro ?? null) : null,
            benchmarksJson: JSON.stringify(entry.benchmarks),
            sourceScoresJson: JSON.stringify(sourceScores),
            sourceCount: Object.values(sourceScores).filter(
              (value) => value != null,
            ).length,
            params: entry.params,
            architecture: entry.architecture,
            modelType: entry.modelType,
            license: entry.license,
            likes: entry.likes,
            fetchedAt,
          });
        });
      await this.repository.upsert(entities, ['id']);
    }
  }
}
