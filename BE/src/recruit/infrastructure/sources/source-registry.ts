import { Injectable } from '@nestjs/common';
import { IntelligentSearchService } from 'src/browse/infrastructure/search/intelligent-search.service';
import { JobSource } from 'src/recruit/domain/job-source.interface';
import { IntelligentSearchEngine } from 'src/recruit/infrastructure/sources/intelligent-search.engine';

@Injectable()
export class SourceRegistry {
  private readonly sources: JobSource[];

  constructor(private readonly intelligentSearch: IntelligentSearchService) {
    this.sources = [new IntelligentSearchEngine(intelligentSearch)];
  }

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
