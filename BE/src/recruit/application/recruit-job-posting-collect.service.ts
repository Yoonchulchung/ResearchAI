import { Injectable } from '@nestjs/common';
import { RecruitCollectImplService } from 'src/recruit/application/job-posting-collect/recruit-collect-impl.service';
import { RecruitRecommendImplService } from 'src/recruit/application/job-posting-collect/recruit-recommend-impl.service';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';

export interface JobRecommendResult {
  id: number;
  jobPostingId: string;
  score: number;
  reason: string | null;
  matchPoints: string[];
  recommendedAt: string;
  title: string;
  company: string;
  companyType: string | null;
  type: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  deadline: string | null;
  jobs: string | null;
  source: string | null;
  appliedAt: string | null;
  url: string;
}

export interface CollectDetailConfig {
  model?: string;
  enableVlm?: boolean;
  skipAiSteps?: boolean;
  maxItems?: number;
  skipExisting?: boolean;
  companyTypes?: string[];
  jobTypes?: string[];
  jobs?: string[];
}

export interface CollectDetailStatus {
  running: boolean;
  total: number;
  processed: number;
  startedAt: string | null;
  lastActivity: string | null;
  lastRunAt: string | null;
  model: string;
  enableVlm: boolean;
}

@Injectable()
export class RecruitJobPostingCollectService {
  constructor(
    private readonly collectImpl: RecruitCollectImplService,
    private readonly recommendImpl: RecruitRecommendImplService,
  ) {}

  getStatus(): CollectDetailStatus {
    return this.collectImpl.getStatus();
  }

  stop(): { message: string } {
    return this.collectImpl.stop();
  }

  collect(config?: CollectDetailConfig): Promise<{ message: string }> {
    return this.collectImpl.collect(config);
  }

  listCollected(limit = 100): Promise<RecruitJobPostingEntity[]> {
    return this.collectImpl.listCollected(limit);
  }

  previewCount(config: CollectDetailConfig): Promise<{ total: number }> {
    return this.collectImpl.previewCount(config);
  }

  generateRecommendations(): Promise<void> {
    return this.recommendImpl.generateRecommendations(
      this.collectImpl.currentConfig.model,
    );
  }

  deleteRecommendation(id: number): Promise<void> {
    return this.recommendImpl.deleteRecommendation(id);
  }

  getRecommendations(limit = 20): Promise<JobRecommendResult[]> {
    return this.recommendImpl.getRecommendations(limit);
  }
}
