import { Injectable } from '@nestjs/common';
import { AppConfigRepository } from '../domain/repository/app-config.repository';

export const CONFIG_KEYS = {
  DEFAULT_LOCAL_MODEL: 'default_local_model',
  DEFAULT_CLOUD_MODEL: 'default_cloud_model',
} as const;

@Injectable()
export class AppConfigService {
  constructor(private readonly repo: AppConfigRepository) {}

  async get(key: string, defaultValue = ''): Promise<string> {
    return (await this.repo.get(key)) ?? defaultValue;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.set(key, value);
  }

  async getAll(): Promise<Record<string, string>> {
    return this.repo.getAll();
  }
}
