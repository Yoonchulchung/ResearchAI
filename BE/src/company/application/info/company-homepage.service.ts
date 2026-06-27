import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';

export interface HomepageNameCandidates {
  siteName: string | null;
  applicationName: string | null;
  appTitle: string | null;
  titleText: string | null;
}

@Injectable()
export class CompanyHomepageService {
  async fetchNameCandidates(
    url: string,
  ): Promise<HomepageNameCandidates | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;

      const $ = load(await res.text());
      return {
        siteName: $('meta[property="og:site_name"]').attr('content') ?? null,
        applicationName:
          $('meta[name="application-name"]').attr('content') ?? null,
        appTitle:
          $('meta[name="apple-mobile-web-app-title"]').attr('content') ?? null,
        titleText: $('title').text() || null,
      };
    } catch {
      return null;
    }
  }
}
