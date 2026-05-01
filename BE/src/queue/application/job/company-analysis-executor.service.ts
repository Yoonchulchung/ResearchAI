import { Injectable } from '@nestjs/common';
import { CompanyAnalysisService } from '../../../documents/application/company-analysis.service';
import { CompanyAnalysisProgress, CompanyAnalysisDto } from '../../../documents/domain/company-analysis.types';

@Injectable()
export class CompanyAnalysisExecutorService {
  constructor(private readonly companyAnalysisService: CompanyAnalysisService) {}

  async execute(
    companyName: string,
    model: string,
    onEvent: (event: CompanyAnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<CompanyAnalysisDto | null> {
    let result: CompanyAnalysisDto | null = null;

    for await (const event of this.companyAnalysisService.analyzeStream(companyName, model)) {
      if (signal?.aborted) break;
      onEvent(event);
      if (event.type === 'done') result = event.result ?? null;
    }

    return result;
  }
}
