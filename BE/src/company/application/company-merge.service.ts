import { Injectable } from '@nestjs/common';
import {
  CompanyMergeImplService,
  MergeCandidate,
  MergeResult,
} from 'src/company/application/info/company-merge-impl.service';

export type {
  MergeCandidate,
  MergeResult,
} from 'src/company/application/info/company-merge-impl.service';

@Injectable()
export class CompanyMergeService {
  constructor(private readonly impl: CompanyMergeImplService) {}

  findDuplicateCandidates(): Promise<MergeCandidate[]> {
    return this.impl.findDuplicateCandidates();
  }

  merge(keepId: string, removeId: string): Promise<MergeResult> {
    return this.impl.merge(keepId, removeId);
  }
}
