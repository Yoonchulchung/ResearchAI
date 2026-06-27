import { Injectable } from '@nestjs/common';
import { CompanyHomepageService } from 'src/company/application/info/company-homepage.service';

const NOISE_WORDS =
  /\b(corp|corporation|inc|incorporated|ltd|limited|co|company|group|holdings|official|home|website|homepage|main|index)\b\.?/gi;

const DISCARD_PATTERNS = [/[가-힣ㄱ-ㅎㅏ-ㅣ]/, /^[^a-zA-Z]+$/, /\s{2,}/];

const DOMAIN_STRIP_PREFIXES = /^(www\d*|m|mobile|en)\./i;
const DOMAIN_STRIP_SUFFIXES =
  /\.(com|co\.kr|kr|net|org|io|ai|app|biz|info|me)$/i;
const DOMAIN_BRAND_NOISE =
  /[-_]?(corp|corporation|inc|incorporated|official|web|site|co|group|holdings)$/i;

@Injectable()
export class CompanyEnglishNameService {
  constructor(private readonly homepage: CompanyHomepageService) {}

  async extractFromUrl(homeUrl: string): Promise<string | null> {
    const candidates = await this.homepage.fetchNameCandidates(homeUrl);
    if (candidates) {
      const ordered = [
        candidates.siteName,
        candidates.applicationName,
        candidates.appTitle,
        candidates.titleText
          ? this.firstTitleSegment(candidates.titleText)
          : null,
      ];
      for (const raw of ordered) {
        const cleaned = this.clean(raw ?? '');
        if (cleaned) return cleaned;
      }
    }
    return this.extractFromDomain(homeUrl);
  }

  extractFromDomain(url: string): string | null {
    try {
      const hostname = new URL(url).hostname;
      const stripped = hostname
        .replace(DOMAIN_STRIP_PREFIXES, '')
        .replace(DOMAIN_STRIP_SUFFIXES, '')
        .replace(DOMAIN_BRAND_NOISE, '');

      // "brand-suffix.com" 형태에서 첫 파트만 사용
      const brand = stripped.split(/[-_.]/)[0];
      return this.clean(brand);
    } catch {
      return null;
    }
  }

  private firstTitleSegment(title: string): string {
    // 한국 사이트에서 시각적 구분자로 쓰이는 'l' / 'ㅣ' 를 표준 '|' 로 정규화
    const normalized = title
      .replace(/\s+l\s+/g, ' | ')
      .replace(/\s+ㅣ\s+/g, ' | ');

    const parts = normalized.split(/\s*[|\-–—·:]\s*/);
    const englishOnly = parts.find(
      (p) => /[a-zA-Z]/.test(p) && !/[가-힣]/.test(p),
    );
    return (englishOnly ?? parts[0] ?? '').trim();
  }

  private clean(raw: string): string | null {
    if (!raw?.trim()) return null;

    let s = raw.trim();
    s = s.replace(NOISE_WORDS, ' ').trim();
    s = s
      .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!s) return null;
    for (const pattern of DISCARD_PATTERNS) {
      if (pattern.test(s)) return null;
    }
    if (s.length > 40) return null;

    return s;
  }
}
