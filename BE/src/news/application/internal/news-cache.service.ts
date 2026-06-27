import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsBriefingEntity } from 'src/news/domain/entity/news-briefing.entity';

@Injectable()
export class NewsCacheService {
  constructor(
    @InjectRepository(NewsBriefingEntity)
    private readonly briefingRepo: Repository<NewsBriefingEntity>,
  ) {}

  todayKey(): string {
    return new Date()
      .toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\. /g, '-')
      .replace('.', '');
  }

  async get<T>(cacheKey: string): Promise<T | null> {
    const cached = await this.briefingRepo.findOneBy({ date: cacheKey });
    return cached?.rawData ? (JSON.parse(cached.rawData) as T) : null;
  }

  async set(cacheKey: string, data: unknown): Promise<void> {
    const rawData = JSON.stringify(data);
    const existing = await this.briefingRepo.findOneBy({ date: cacheKey });

    if (existing) {
      await this.briefingRepo.update({ date: cacheKey }, { rawData });
      return;
    }

    await this.briefingRepo.save({
      date: cacheKey,
      titlesHash: '',
      summary: '',
      rawData,
    });
  }

  async clearToday(): Promise<void> {
    await this.briefingRepo
      .createQueryBuilder()
      .delete()
      .where('date LIKE :pattern', { pattern: `%-${this.todayKey()}` })
      .execute();
  }
}
