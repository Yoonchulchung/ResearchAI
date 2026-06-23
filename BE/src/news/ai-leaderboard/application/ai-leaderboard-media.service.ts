import { Injectable, Logger } from '@nestjs/common';
import { AiLeaderboardSourceService } from 'src/news/ai-leaderboard/application/ai-leaderboard-source.service';
import { AiLeaderboardScoreService } from 'src/news/ai-leaderboard/application/ai-leaderboard-score.service';
import { AiLeaderboardStoreService } from 'src/news/ai-leaderboard/application/ai-leaderboard-store.service';
import { AiLeaderboardPopularityService } from 'src/news/ai-leaderboard/application/ai-leaderboard-popularity.service';
import { NormalizedLeaderboardEntry } from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

const ENDPOINTS: Record<string, string> = {
  tts: 'https://artificialanalysis.ai/api/v2/data/media/text-to-speech',
  'text-to-image':
    'https://artificialanalysis.ai/api/v2/data/media/text-to-image?include_categories=true',
  'image-editing':
    'https://artificialanalysis.ai/api/v2/data/media/image-editing',
  'text-to-video':
    'https://artificialanalysis.ai/api/v2/data/media/text-to-video?include_categories=true',
  'image-to-video':
    'https://artificialanalysis.ai/api/v2/data/media/image-to-video?include_categories=true',
};

@Injectable()
export class AiLeaderboardMediaService {
  private readonly logger = new Logger(AiLeaderboardMediaService.name);

  constructor(
    private readonly source: AiLeaderboardSourceService,
    private readonly scores: AiLeaderboardScoreService,
    private readonly store: AiLeaderboardStoreService,
    private readonly popularity: AiLeaderboardPopularityService,
  ) {}

  async refresh(category: string): Promise<void> {
    this.logger.log(`Fetching ${category} models...`);
    const artificialAnalysisEntries =
      await this.fetchArtificialAnalysisEntries(category);

    let entries = artificialAnalysisEntries;
    if (category === 'text-to-image') {
      const popularityEntries = await this.popularity.fetchEntries(
        'text-to-image',
        category,
        120,
      );
      entries = artificialAnalysisEntries.length
        ? this.scores.mergeByModel(category, [
            artificialAnalysisEntries,
            popularityEntries,
          ])
        : popularityEntries;
    }

    await this.store.save(entries, category);
    this.logger.log(`Stored ${entries.length} ${category} entries`);
  }

  private async fetchArtificialAnalysisEntries(
    category: string,
  ): Promise<NormalizedLeaderboardEntry[]> {
    const endpoint = ENDPOINTS[category];
    if (!endpoint) return [];

    const apiKey = await this.source.getArtificialAnalysisApiKey();
    if (!apiKey) {
      this.logger.warn(
        `Artificial Analysis API key is not configured; skipping ${category}.`,
      );
      return [];
    }

    const response = (await this.source.fetchJson(endpoint, {
      'x-api-key': apiKey,
      Accept: 'application/json',
    })) as { data?: unknown[] };
    const rows = (Array.isArray(response.data) ? response.data : []) as Array<{
      id?: string;
      name?: string;
      slug?: string;
      model_creator?: { name?: string; slug?: string };
      elo?: unknown;
      rank?: unknown;
      appearances?: unknown;
      release_date?: string;
      categories?: Array<Record<string, unknown>>;
    }>;
    const eloValues = rows
      .map((row) => this.number(row.elo))
      .filter((value): value is number => value != null);
    const minElo = Math.min(...eloValues);
    const maxElo = Math.max(...eloValues);

    return rows
      .map((row): NormalizedLeaderboardEntry | null => {
        const fullname = String(row.name ?? row.slug ?? row.id ?? '').trim();
        if (!fullname) return null;

        const elo = this.number(row.elo);
        const categoryElos = (row.categories ?? [])
          .map((item) => this.number(item.elo))
          .filter((value): value is number => value != null);
        const qualityScore = this.scores.normalizeRange(elo, minElo, maxElo);

        return {
          id: this.scores.entryId(category, fullname),
          fullname,
          org: String(
            row.model_creator?.name ?? row.model_creator?.slug ?? '',
          ).trim(),
          modelName: fullname,
          average: qualityScore,
          params: null,
          modelType: null,
          license: null,
          architecture: row.release_date ?? null,
          likes: null,
          benchmarks: {
            elo,
            aaRank: this.number(row.rank),
            appearances: this.number(row.appearances),
            categoryBestElo:
              categoryElos.length > 0 ? Math.max(...categoryElos) : null,
            categoryCount: categoryElos.length || null,
          },
          sourceScores: {
            'Artificial Analysis Elo': qualityScore,
          },
        };
      })
      .filter((entry): entry is NormalizedLeaderboardEntry => entry != null);
  }

  private number(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
