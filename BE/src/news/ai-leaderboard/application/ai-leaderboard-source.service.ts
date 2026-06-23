import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/auth/domain/entity/user.entity';
import { requestContext } from 'src/shared/request-context';

const FETCH_TIMEOUT_MS = 20_000;

@Injectable()
export class AiLeaderboardSourceService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async getArtificialAnalysisApiKey(): Promise<string | null> {
    const contextKey = requestContext
      .getStore()
      ?.apiKeys.artificialAnalysisApiKey?.trim();
    if (contextKey) return contextKey;

    const envKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim();
    if (envKey) return envKey;

    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.artificialAnalysisApiKey IS NOT NULL')
      .andWhere("user.artificialAnalysisApiKey != ''")
      .orderBy('user.updatedAt', 'DESC')
      .getOne();
    return user?.artificialAnalysisApiKey?.trim() || null;
  }

  async fetchJson(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  fetchHuggingFaceJson(url: string): Promise<unknown> {
    return this.fetchJson(url, { Accept: 'application/json' });
  }

  async fetchHuggingFaceDatasetRows(
    dataset: string,
    config: string,
    split: string,
    offset: number,
    length: number,
  ): Promise<unknown[]> {
    const url =
      'https://datasets-server.huggingface.co/rows' +
      `?dataset=${encodeURIComponent(dataset)}` +
      `&config=${config}&split=${split}&length=${length}&offset=${offset}`;
    const data = (await this.fetchHuggingFaceJson(url)) as {
      rows?: { row: unknown }[];
    };
    return (data.rows ?? []).map((row) => row.row);
  }
}
