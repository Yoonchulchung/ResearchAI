import { Injectable, Logger } from '@nestjs/common';
import { BrowserNewsSearchResult } from 'src/browse/application/browser.types';

export interface SerperWebResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

@Injectable()
export class SerperSearchService {
  private readonly logger = new Logger(SerperSearchService.name);

  private get serperKey(): string | null {
    const key = process.env.SERPER_API_KEY;
    return key && !key.startsWith('your_') ? key : null;
  }

  /** Serper /search — 결과 없거나 키 없으면 null 반환 */
  async searchWeb(
    query: string,
    limit = 10,
  ): Promise<SerperWebResult[] | null> {
    const key = this.serperKey;
    if (!key) return null;

    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q: query, num: limit, hl: 'ko', gl: 'kr' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        organic?: Array<{ title?: string; link?: string; snippet?: string }>;
      };
      const items = (data.organic ?? [])
        .filter((r): r is { title: string; link: string; snippet?: string } =>
          Boolean(r.title && r.link),
        )
        .slice(0, limit)
        .map((r) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet ?? '',
          source: new URL(r.link).hostname.replace(/^www\./, ''),
        }));

      if (items.length > 0) {
        this.logger.log(
          `searchWeb(Serper): query="${query}" got=${items.length}`,
        );
        return items;
      }
      return null;
    } catch (e) {
      this.logger.warn(`Serper search 실패: ${(e as Error).message}`);
      return null;
    }
  }

  /** Serper /news — 결과 없거나 키 없으면 null 반환, publishedAt 포함 */
  async searchNews(
    query: string,
    limit = 10,
  ): Promise<BrowserNewsSearchResult[] | null> {
    const key = this.serperKey;
    if (!key) return null;

    try {
      const res = await fetch('https://google.serper.dev/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q: query, num: limit, hl: 'ko', gl: 'kr' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        news?: Array<{
          title?: string;
          link?: string;
          snippet?: string;
          date?: string;
          source?: string;
          imageUrl?: string;
        }>;
      };
      const items = (data.news ?? [])
        .filter(
          (
            r,
          ): r is {
            title: string;
            link: string;
            snippet?: string;
            date?: string;
            source?: string;
            imageUrl?: string;
          } => Boolean(r.title && r.link),
        )
        .slice(0, limit)
        .map((r) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet ?? '',
          publishedAt: this.parseDate(r.date),
          source: r.source ?? new URL(r.link).hostname.replace(/^www\./, ''),
          imageUrl: r.imageUrl,
        }));

      if (items.length > 0) {
        this.logger.log(
          `searchNews(Serper): query="${query}" got=${items.length}`,
        );
        return items;
      }
      return null;
    } catch (e) {
      this.logger.warn(`Serper news 실패: ${(e as Error).message}`);
      return null;
    }
  }

  /** Serper 날짜 문자열 → ISO 8601 변환 */
  parseDate(dateStr?: string): string | null {
    if (!dateStr) return null;

    const relMatch = dateStr.match(
      /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i,
    );
    if (relMatch) {
      const n = parseInt(relMatch[1], 10);
      const unit = relMatch[2].toLowerCase();
      const unitMs: Record<string, number> = {
        minute: 60_000,
        hour: 3_600_000,
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
      };
      return new Date(Date.now() - n * (unitMs[unit] ?? 0)).toISOString();
    }

    const ts = Date.parse(dateStr);
    return Number.isNaN(ts) ? null : new Date(ts).toISOString();
  }
}
