import * as https from 'https';
import * as http from 'http';
import { Injectable, Logger } from '@nestjs/common';

export interface DdgResult {
  title: string;
  url: string;
  snippet: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const DDG_HTML_BASE = 'https://html.duckduckgo.com/html/';
const REQUEST_TIMEOUT_MS = 15_000;
const BETWEEN_REQUESTS_MS = 600;

/**
 * DuckDuckGo HTML 인터페이스를 통한 정적 검색 서비스.
 * JavaScript 렌더링이 불필요하므로 Puppeteer를 쓰지 않습니다.
 */
@Injectable()
export class DdgSearchService {
  private readonly logger = new Logger(DdgSearchService.name);

  /** 단일 DDG 쿼리 실행 */
  async search(query: string, maxResults = 10): Promise<DdgResult[]> {
    try {
      const html = await this.fetchHtml(query);
      const results = this.parseHtml(html);
      return results.slice(0, maxResults);
    } catch (e) {
      this.logger.warn(`[DDG] 검색 실패 — "${query}": ${(e as Error).message}`);
      return [];
    }
  }

  /** 여러 쿼리를 순차 실행 (요청 간 간격 포함) */
  async searchMultiple(queries: string[], maxPerQuery = 10): Promise<DdgResult[]> {
    const seen = new Set<string>();
    const all: DdgResult[] = [];

    for (const query of queries) {
      const results = await this.search(query, maxPerQuery);
      for (const r of results) {
        const key = this.normalizeUrl(r.url);
        if (!seen.has(key)) {
          seen.add(key);
          all.push(r);
        }
      }
      await this.delay(BETWEEN_REQUESTS_MS);
    }

    return all;
  }

  private fetchHtml(query: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ q: query, kl: 'kr-kr' });
      const url = `${DDG_HTML_BASE}?${params.toString()}`;
      const parsed = new URL(url);

      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
        },
      };

      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`DDG 요청 타임아웃 (${REQUEST_TIMEOUT_MS}ms)`));
      }, REQUEST_TIMEOUT_MS);

      const req = https.request(options, (res: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        res.on('error', (e) => { clearTimeout(timer); reject(e); });
      });

      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  private parseHtml(html: string): DdgResult[] {
    const results: DdgResult[] = [];

    // DDG HTML 결과 블록: <div class="result ...">...</div>
    const blockRegex = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*result[^"]*"|<\/div>\s*<\/body>|$)/g;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRegex.exec(html)) !== null) {
      const block = blockMatch[1];

      // 제목/URL: <a class="result__a" href="...">Title</a>
      const anchorMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!anchorMatch) continue;

      const rawHref = anchorMatch[1];
      const titleHtml = anchorMatch[2];
      const title = this.stripHtml(titleHtml).replace(/\s+/g, ' ').trim();
      if (!title) continue;

      const url = this.decodeUrl(rawHref);
      if (!url || url.includes('duckduckgo.com')) continue;

      // 스니펫: <a class="result__snippet">...</a>
      const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]).replace(/\s+/g, ' ').trim() : '';

      results.push({ title, url, snippet });
    }

    return results;
  }

  private decodeUrl(raw: string): string {
    // DDG는 /l/?uddg= 형태로 인코딩하거나 직접 URL을 사용
    if (raw.includes('uddg=')) {
      const match = raw.match(/uddg=([^&]+)/);
      if (match) {
        try { return decodeURIComponent(match[1]); } catch { /* ignore */ }
      }
    }
    if (raw.startsWith('http')) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source', 'from'].forEach(
        (p) => u.searchParams.delete(p),
      );
      u.hash = '';
      return u.toString().toLowerCase().replace(/\/$/, '');
    } catch {
      return url.toLowerCase();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
