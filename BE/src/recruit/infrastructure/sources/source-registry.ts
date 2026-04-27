import { Injectable } from '@nestjs/common';
import { JobSource } from '../../domain/job-source.interface';
import { MultiSiteJobCrawler } from './multi-site.crawler';

@Injectable()
export class SourceRegistry {
  private readonly sources: JobSource[] = [
    new MultiSiteJobCrawler(),
  ];

  getAll(): { name: string; type: string; available: boolean }[] {
    return this.sources.map((s) => ({
      name: s.name,
      type: s.type,
      available: s.isAvailable(),
    }));
  }

  getAvailable(names?: string[]): JobSource[] {
    return this.sources.filter((s) => {
      if (!s.isAvailable()) return false;
      if (names && names.length > 0) return names.includes(s.name);
      return true;
    });
  }
}
