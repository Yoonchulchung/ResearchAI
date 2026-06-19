import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSettingEntity } from 'src/shared/entity/system-setting.entity';

export const SETTING_KEYS = {
  COMPANY_COLLECT_ENABLED: 'company_collect_enabled',
} as const;

@Injectable()
export class SystemSettingsService {
  constructor(
    @InjectRepository(SystemSettingEntity)
    private readonly repo: Repository<SystemSettingEntity>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.upsert({ key, value }, ['key']);
  }

  async getBool(key: string, defaultValue = true): Promise<boolean> {
    const val = await this.get(key);
    if (val === null) return defaultValue;
    return val === 'true';
  }

  async setBool(key: string, value: boolean): Promise<void> {
    await this.set(key, value ? 'true' : 'false');
  }

  async isCompanyCollectEnabled(): Promise<boolean> {
    return this.getBool(SETTING_KEYS.COMPANY_COLLECT_ENABLED, true);
  }

  async setCompanyCollectEnabled(enabled: boolean): Promise<void> {
    await this.setBool(SETTING_KEYS.COMPANY_COLLECT_ENABLED, enabled);
  }
}
