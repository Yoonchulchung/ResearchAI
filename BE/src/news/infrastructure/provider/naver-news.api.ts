import { Injectable, Logger } from '@nestjs/common';
import { requestContext } from 'src/shared/request-context';

export interface NaverNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

interface NaverNewsResponse {
  items?: {
    title?: string;
    originallink?: string;
    link?: string;
    description?: string;
    pubDate?: string;
  }[];
}

@Injectable()
export class NaverNewsApi {
  private readonly logger = new Logger(NaverNewsApi.name);

  async fetchByQuery(
    query: string,
    limit?: number,
    offset?: number,
  ): Promise<NaverNewsItem[]>;
  async fetchByQuery(
    query: string,
    limit = 15,
    offset = 0,
  ): Promise<NaverNewsItem[]> {
    const credentials = this.getCredentials();
    if (!credentials) {
      this.logger.warn(
        'Naver 뉴스 API 키가 없어 뉴스 피드를 가져올 수 없습니다.',
      );
      return [];
    }

    const display = Math.min(Math.max(Math.floor(limit), 1), 100);
    const start = Math.min(Math.max(Math.floor(offset), 0), 999) + 1;
    const params = new URLSearchParams({
      query,
      display: String(display),
      start: String(start),
      sort: 'date',
    });

    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?${params.toString()}`,
      {
        headers: {
          'X-Naver-Client-Id': credentials.clientId,
          'X-Naver-Client-Secret': credentials.clientSecret,
        },
      },
    );

    if (!res.ok) throw new Error(`Naver News HTTP ${res.status}`);

    const data = (await res.json()) as NaverNewsResponse;
    return (data.items ?? [])
      .map((item) => {
        const link = item.originallink || item.link || '';
        return {
          title: this.stripHtml(item.title ?? ''),
          link,
          source: this.sourceFromUrl(link) || 'Naver News',
          pubDate: this.toIsoDate(item.pubDate) ?? item.pubDate ?? '',
          description: this.stripHtml(item.description ?? ''),
        };
      })
      .filter((item) => item.title && item.link);
  }

  private getCredentials(): { clientId: string; clientSecret: string } | null {
    const keys = requestContext.getStore()?.apiKeys;
    const clientId = keys?.naverClientId?.trim() || process.env.NAVER_CLIENT_ID;
    const clientSecret =
      keys?.naverClientSecret?.trim() || process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sourceFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return hostname;
    } catch {
      return '';
    }
  }

  private toIsoDate(value?: string): string | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp).toISOString();
  }
}
