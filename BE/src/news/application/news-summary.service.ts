import { Injectable } from '@nestjs/common';
import { NewsSummaryGeneratorService } from 'src/news/application/internal/news-summary-generator.service';

export interface NewsSummaryResult {
  summary: string;
  generatedAt: string;
  cached: boolean;
  aiModel: string | null;
}

@Injectable()
export class NewsSummaryService {
  constructor(private readonly generator: NewsSummaryGeneratorService) {}

  getGithubSummary(since: string): Promise<NewsSummaryResult> {
    return this.generator.getGithubSummary(since);
  }

  getHfSummary(category: string): Promise<NewsSummaryResult> {
    return this.generator.getHfSummary(category);
  }

  getNewsSummary(): Promise<NewsSummaryResult> {
    return this.generator.getNewsSummary();
  }
}
