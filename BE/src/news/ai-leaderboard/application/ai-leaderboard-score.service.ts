import { Injectable } from '@nestjs/common';
import { NormalizedLeaderboardEntry } from 'src/news/ai-leaderboard/application/ai-leaderboard.types';

@Injectable()
export class AiLeaderboardScoreService {
  withSourceScores(
    entries: NormalizedLeaderboardEntry[],
    sourceName: string,
  ): NormalizedLeaderboardEntry[] {
    return entries.map((entry) => {
      const sourceScores = { ...(entry.sourceScores ?? {}) };
      if (entry.average != null && Object.keys(sourceScores).length === 0) {
        sourceScores[sourceName] = entry.average;
      }
      return { ...entry, sourceScores };
    });
  }

  mergeByModel(
    category: string,
    groups: NormalizedLeaderboardEntry[][],
  ): NormalizedLeaderboardEntry[] {
    const byModel = new Map<string, NormalizedLeaderboardEntry>();

    for (const entries of groups) {
      for (const entry of entries) {
        const key = this.modelKey(entry.fullname);
        const current = byModel.get(key);
        if (!current) {
          byModel.set(key, {
            ...entry,
            id: this.entryId(category, entry.fullname),
            benchmarks: { ...entry.benchmarks },
            sourceScores: { ...(entry.sourceScores ?? {}) },
          });
          continue;
        }

        const sourceScores = {
          ...(current.sourceScores ?? {}),
          ...(entry.sourceScores ?? {}),
        };
        const benchmarks = { ...current.benchmarks };
        for (const [name, value] of Object.entries(entry.benchmarks)) {
          if (benchmarks[name] == null && value != null) {
            benchmarks[name] = value;
          }
        }

        byModel.set(key, {
          ...current,
          org: current.org || entry.org,
          modelName: current.modelName || entry.modelName,
          params: current.params ?? entry.params,
          architecture: current.architecture ?? entry.architecture,
          modelType: current.modelType ?? entry.modelType,
          license: current.license ?? entry.license,
          likes: current.likes ?? entry.likes,
          benchmarks,
          sourceScores,
          average: this.average(Object.values(sourceScores)),
        });
      }
    }

    return this.rank([...byModel.values()]);
  }

  rank(entries: NormalizedLeaderboardEntry[]): NormalizedLeaderboardEntry[] {
    return [...entries].sort((left, right) => {
      const score = (right.average ?? -Infinity) - (left.average ?? -Infinity);
      return score !== 0
        ? score
        : this.sourceCount(right) - this.sourceCount(left);
    });
  }

  sourceCount(entry: NormalizedLeaderboardEntry): number {
    return Object.values(entry.sourceScores ?? {}).filter(
      (value) => value != null,
    ).length;
  }

  entryId(category: string, fullname: string): string {
    return category === 'llm' ? fullname : `${category}:${fullname}`;
  }

  modelKey(fullname: string): string {
    return fullname.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  average(values: Array<number | null | undefined>): number | null {
    const valid = values.filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    );
    if (!valid.length) return null;
    return (
      Math.round(
        (valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100,
      ) / 100
    );
  }

  normalizeRange(
    value: number | null,
    min: number,
    max: number,
  ): number | null {
    if (value == null || !Number.isFinite(min) || !Number.isFinite(max)) {
      return value;
    }
    if (max <= min) return 100;
    return Math.round(((value - min) / (max - min)) * 1000) / 10;
  }

  percent(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric <= 1 ? Math.round(numeric * 1000) / 10 : numeric;
  }
}
