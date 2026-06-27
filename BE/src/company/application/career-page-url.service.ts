import { Injectable } from '@nestjs/common';
import { CareerPageUrlImplService } from 'src/company/application/career/career-page-url-impl.service';

@Injectable()
export class CareerPageUrlService {
  constructor(private readonly impl: CareerPageUrlImplService) {}

  normalize(
    companyName: string,
    url: string | null | undefined,
    candidates: string[] = [],
    officialWebsiteUrl?: string | null,
  ): string | null {
    return this.impl.normalize(
      companyName,
      url,
      candidates,
      officialWebsiteUrl,
    );
  }
}
