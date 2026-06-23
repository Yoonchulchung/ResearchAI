import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { NaverNewsItem } from './naver-news.api';

const SECTION_IDS: Record<string, string> = {
  it: '105',
  science: '105',
  economy: '101',
  society: '102',
  politics: '100',
  world: '104',
  culture: '103',
};

@Injectable()
export class NaverRssApi {
  private readonly logger = new Logger(NaverRssApi.name);

  async fetchByCategory(
    category: string,
    limit = 20,
  ): Promise<NaverNewsItem[]> {
    const sid = SECTION_IDS[category] ?? SECTION_IDS.it;
    const url = `https://news.naver.com/main/rss/section.nhn?sid1=${sid}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        this.logger.warn(`Naver RSS section ${sid} HTTP ${res.status}`);
        return [];
      }

      const xml = await res.text();
      return this.parseRss(xml, limit);
    } catch (e) {
      this.logger.warn(`Naver RSS failed: ${(e as Error).message}`);
      return [];
    }
  }

  private parseRss(xml: string, limit: number): NaverNewsItem[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: NaverNewsItem[] = [];

    $('item').each((_, el) => {
      if (items.length >= limit) return false;

      const title = this.stripHtml($('title', el).text().trim());
      const link =
        $('originallink', el).text().trim() ||
        $('link', el).text().trim() ||
        '';
      const description = this.stripHtml($('description', el).text().trim());
      const pubDateRaw = $('pubDate', el).text().trim();
      const pubDate = this.toIsoDate(pubDateRaw) ?? pubDateRaw;
      const source = this.sourceFromUrl(link) || 'Naver';

      const imageUrl =
        $('enclosure', el).attr('url') ||
        $('media\\:thumbnail', el).attr('url') ||
        $('media\\:content', el).attr('url') ||
        this.extractImgFromHtml($('description', el).text()) ||
        null;

      if (title && link) {
        items.push({ title, link, source, pubDate, description, imageUrl });
      }
    });

    return items;
  }

  private extractImgFromHtml(html: string): string | null {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match?.[1] ?? null;
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
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private toIsoDate(value?: string): string | null {
    if (!value) return null;
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) return null;
    return new Date(ts).toISOString();
  }
}
