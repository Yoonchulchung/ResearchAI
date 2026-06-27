import { BrowserWebSearchResult } from 'src/browse/application/browser.types';

export const COMPANY_PROFILE_URL_SEARCH_PORT = Symbol(
  'COMPANY_PROFILE_URL_SEARCH_PORT',
);

export interface CompanyProfileUrlSearchPort {
  searchWeb(query: string, limit: number): Promise<BrowserWebSearchResult[]>;
}
