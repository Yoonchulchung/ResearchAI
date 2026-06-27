import { Injectable } from '@nestjs/common';
import {
  CompanyAnalysisDto,
  CompanyAnalysisProgress,
} from 'src/company/domain/company-analysis.types';
import { CompanyAnalysisImplService } from 'src/company/application/analysis/company-analysis-impl.service';

@Injectable()
export class CompanyAnalysisService {
  constructor(private readonly impl: CompanyAnalysisImplService) {}

  findAll(): Promise<CompanyAnalysisDto[]> {
    return this.impl.findAll();
  }

  findByKey(companyKey: string): Promise<CompanyAnalysisDto> {
    return this.impl.findByKey(companyKey);
  }

  findByName(companyName: string): Promise<CompanyAnalysisDto | null> {
    return this.impl.findByName(companyName);
  }

  delete(companyKey: string): Promise<void> {
    return this.impl.delete(companyKey);
  }

  buildChatContext(companyKey: string): Promise<string> {
    return this.impl.buildChatContext(companyKey);
  }

  analyzeStream(
    companyName: string,
    aiModel: string,
    signal?: AbortSignal,
  ): AsyncGenerator<CompanyAnalysisProgress> {
    return this.impl.analyzeStream(companyName, aiModel, signal);
  }
}
