import { Injectable, Logger } from '@nestjs/common';
import { AiLeaderboardSourceService } from 'src/news/ai-leaderboard/application/ai-leaderboard-source.service';
import { AiLeaderboardScoreService } from 'src/news/ai-leaderboard/application/ai-leaderboard-score.service';
import { NormalizedLeaderboardEntry } from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

@Injectable()
export class AiLeaderboardPopularityService {
  private readonly logger = new Logger(AiLeaderboardPopularityService.name);

  constructor(
    private readonly source: AiLeaderboardSourceService,
    private readonly scores: AiLeaderboardScoreService,
  ) {}

  async addEvidence(
    category: string,
    benchmarkEntries: NormalizedLeaderboardEntry[],
    pipelineTag: string,
    limit: number,
    tagFilter?: string,
  ): Promise<NormalizedLeaderboardEntry[]> {
    const popularityEntries = await this.fetchEntries(
      pipelineTag,
      category,
      limit,
      tagFilter,
    );
    if (!benchmarkEntries.length) return this.scores.rank(popularityEntries);

    const benchmarkKeys = new Set(
      benchmarkEntries.map((entry) => this.scores.modelKey(entry.fullname)),
    );
    return this.scores
      .mergeByModel(category, [benchmarkEntries, popularityEntries])
      .filter((entry) =>
        benchmarkKeys.has(this.scores.modelKey(entry.fullname)),
      );
  }

  async fetchEntries(
    pipelineTag: string,
    category: string,
    limit: number,
    tagFilter?: string,
  ): Promise<NormalizedLeaderboardEntry[]> {
    let url =
      'https://huggingface.co/api/models' +
      `?pipeline_tag=${encodeURIComponent(pipelineTag)}` +
      `&sort=likes&limit=${limit}&full=false`;
    if (tagFilter) url += `&filter=${encodeURIComponent(tagFilter)}`;

    try {
      const response = (await this.source.fetchHuggingFaceJson(url)) as Array<{
        id: string;
        likes?: number;
        downloads?: number;
      }>;
      const rows = Array.isArray(response) ? response : [];
      const maxLikes = Math.max(
        ...rows.map((row) => Math.log1p(row.likes ?? 0)),
        1,
      );
      const maxDownloads = Math.max(
        ...rows.map((row) => Math.log1p(row.downloads ?? 0)),
        1,
      );

      return rows.map((row) => {
        const { org, modelName } = this.parseId(row.id);
        const likes = typeof row.likes === 'number' ? row.likes : null;
        const downloads =
          typeof row.downloads === 'number' ? row.downloads : null;
        const likeScore =
          likes != null
            ? Math.round((Math.log1p(likes) / maxLikes) * 1000) / 10
            : null;
        const downloadScore =
          downloads != null
            ? Math.round((Math.log1p(downloads) / maxDownloads) * 1000) / 10
            : null;

        return {
          id: this.scores.entryId(category, row.id),
          fullname: row.id,
          org,
          modelName,
          average: this.scores.average([likeScore, downloadScore]),
          params: null,
          modelType: null,
          license: null,
          architecture: null,
          likes,
          benchmarks: {
            hfLikes: likes,
            hfDownloads:
              downloads != null ? Math.round(downloads / 1000) : null,
          },
          sourceScores: {
            'HuggingFace Likes': likeScore,
            'HuggingFace Downloads': downloadScore,
          },
        };
      });
    } catch (error) {
      this.logger.warn(
        `HF models API failed for ${pipelineTag}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private parseId(fullname: string): { org: string; modelName: string } {
    const parts = fullname.split('/');
    return parts.length > 1
      ? { org: parts[0], modelName: parts.slice(1).join('/') }
      : { org: '', modelName: fullname };
  }
}
