import { Injectable } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import { BrowserWebSearchResult } from 'src/browse/application/browser.types';
import { CompanyProfileUrlSearchPort } from 'src/company/application/info/company-profile-url-search.port';

@Injectable()
export class CompanyProfileUrlSearchAdapter implements CompanyProfileUrlSearchPort {
  constructor(private readonly browser: BrowserService) {}

  searchWeb(query: string, limit: number): Promise<BrowserWebSearchResult[]> {
    return this.browser.searchWeb(query, limit);
  }
}
