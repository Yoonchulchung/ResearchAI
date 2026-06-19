import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DartReportService {
  private readonly logger = new Logger(DartReportService.name);

  async fetchAnnualReportSections(rceptNo: string): Promise<string | null> {
    try {
      const mainHtml = await this.fetchHtml(
        `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`,
      );
      if (!mainHtml) {
        this.logger.error('[DART] 사업보고서 메인 뷰어 접근 실패');
        return null;
      }

      const frameSrcs = [
        ...mainHtml.matchAll(/src\s*=\s*["']([^"']+)["']/gi),
      ].map((m) => m[1]);
      const tocSrc = frameSrcs.find((s) => /toc/i.test(s));
      if (!tocSrc) {
        this.logger.error('[DART] TOC frame 미발견');
        return null;
      }

      const tocUrl = tocSrc.startsWith('http')
        ? tocSrc
        : `https://dart.fss.or.kr${tocSrc}`;

      const tocHtml = await this.fetchHtml(tocUrl);
      if (!tocHtml) {
        this.logger.error('[DART] TOC 접근 실패');
        return null;
      }

      const sectionUrl = this.findSectionUrl(tocHtml);
      if (!sectionUrl) {
        this.logger.error('[DART] 사업의 내용 링크 미발견');
        return null;
      }

      const contentHtml = await this.fetchHtml(sectionUrl);
      if (!contentHtml) return null;

      const tables = this.extractTables(contentHtml);
      const plainText = this.stripHtml(contentHtml);

      const parts: string[] = [];
      if (tables.trim())
        parts.push(`[사업부문 테이블]\n${tables.slice(0, 2500)}`);
      if (plainText.trim())
        parts.push(`[사업 내용]\n${plainText.slice(0, 2500)}`);

      return parts.join('\n\n').slice(0, 5000) || null;
    } catch (err) {
      this.logger.error(
        `[DART] 사업보고서 파싱 오류: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async resolveDisclosurePdfUrl(disclosureUrl: string): Promise<string | null> {
    const rceptNo = this.extractRceptNo(disclosureUrl);
    if (!rceptNo) return null;

    const mainHtml = await this.fetchHtml(
      `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`,
    );
    if (!mainHtml) return null;

    const dcmNo = this.extractDcmNo(mainHtml);
    if (!dcmNo) return null;

    return `https://dart.fss.or.kr/pdf/download/pdf.do?rcp_no=${encodeURIComponent(rceptNo)}&dcm_no=${encodeURIComponent(dcmNo)}`;
  }

  async fetchDisclosurePdf(disclosureUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    contentDisposition: string | null;
  } | null> {
    const rceptNo = this.extractRceptNo(disclosureUrl);
    if (!rceptNo) return null;

    const mainHtml = await this.fetchHtml(
      `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`,
    );
    if (!mainHtml) return null;

    const dcmNo = this.extractDcmNo(mainHtml);
    if (!dcmNo) return null;

    const downloadMainUrl = `https://dart.fss.or.kr/pdf/download/main.do?rcp_no=${encodeURIComponent(rceptNo)}&dcm_no=${encodeURIComponent(dcmNo)}`;
    const mainRes = await fetch(downloadMainUrl, {
      headers: this.dartBrowserHeaders(
        `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`,
      ),
      signal: AbortSignal.timeout(15000),
    });
    if (!mainRes.ok) return null;

    const cookie = this.extractCookieHeader(mainRes.headers.get('set-cookie'));
    const pdfUrl = `https://dart.fss.or.kr/pdf/download/pdf.do?rcp_no=${encodeURIComponent(rceptNo)}&dcm_no=${encodeURIComponent(dcmNo)}`;
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        ...this.dartBrowserHeaders(downloadMainUrl),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!pdfRes.ok) return null;

    const contentType = pdfRes.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/pdf')) return null;

    const arrayBuffer = await pdfRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
      contentDisposition: pdfRes.headers.get('content-disposition'),
    };
  }

  private extractRceptNo(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('rcpNo') ?? parsed.searchParams.get('rcp_no');
    } catch {
      const match = url.match(/(?:rcpNo|rcp_no)=([0-9]+)/i);
      return match?.[1] ?? null;
    }
  }

  private extractDcmNo(html: string): string | null {
    const downloadMatch = html.match(
      /openPdfDownload\(['"]\d+['"]\s*,\s*['"]([0-9]+)['"]\)/i,
    );
    if (downloadMatch?.[1]) return downloadMatch[1];

    const patterns = [
      /dcmNo\s*=\s*["']?([0-9]+)/i,
      /dcm_no\s*=\s*["']?([0-9]+)/i,
      /dcmNo=([0-9]+)/i,
      /dcm_no=([0-9]+)/i,
      /["']dcmNo["']\s*:\s*["']?([0-9]+)/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  private dartBrowserHeaders(referer: string): Record<string, string> {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: referer,
    };
  }

  private extractCookieHeader(setCookie: string | null): string | null {
    if (!setCookie) return null;
    return setCookie
      .split(/,(?=[^;,]+=)/)
      .map((part) => part.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
  }

  private findSectionUrl(tocHtml: string): string | null {
    const idx = tocHtml.search(/사업의\s*내용/);
    if (idx === -1) return null;
    const window = tocHtml.slice(Math.max(0, idx - 800), idx + 200);

    const goPageMatch = window.match(/goPage\(['"]([^'"]+)['"]/);
    if (goPageMatch) {
      const u = goPageMatch[1];
      return u.startsWith('http') ? u : `https://dart.fss.or.kr${u}`;
    }
    const hrefMatch = window.match(/href\s*=\s*["']([^"']*viewer[^"']*)["']/i);
    if (hrefMatch) {
      const u = hrefMatch[1];
      return u.startsWith('http') ? u : `https://dart.fss.or.kr${u}`;
    }
    return null;
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: 'https://dart.fss.or.kr/',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        this.logger.error(`[DART] HTTP ${res.status} — ${url}`);
        return null;
      }
      return await res.text();
    } catch (err) {
      this.logger.error(
        `[DART] fetchHtml 오류 — ${url}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractTables(html: string): string {
    const results: string[] = [];
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tblMatch: RegExpExecArray | null;
    while ((tblMatch = tableRe.exec(html)) !== null) {
      const rows: string[] = [];
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(tblMatch[0])) !== null) {
        const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRe.exec(rowMatch[0])) !== null) {
          const text = this.stripHtml(cellMatch[1]).slice(0, 80);
          if (text) cells.push(text);
        }
        if (cells.length >= 2) rows.push(cells.join(' | '));
      }
      if (rows.length >= 2) results.push(rows.join('\n'));
    }
    return results.join('\n\n');
  }
}
