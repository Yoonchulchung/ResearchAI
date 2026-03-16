import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigEntity } from '../entity/app-config.entity';

@Injectable()
export class AppConfigRepository {
  constructor(
    @InjectRepository(AppConfigEntity)
    private readonly repo: Repository<AppConfigEntity>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.upsert({ key, value }, ['key']);
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.repo.find();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
