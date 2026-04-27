import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';

export interface JobplanetReview {
  rating: number;
  title: string;
  pros: string;
  cons: string;
  date: string;
}

export interface JobplanetCompanyData {
  companyName: string;
  overallRating: number;
  reviewCount: number;
  welfare: string;
  cultureRating: string;
  wlbRating: string;
  reviews: JobplanetReview[];
  rawSummary: string;
}

@Injectable()
export class JobplanetScraperService {
  private readonly logger = new Logger(JobplanetScraperService.name);

  async scrapeCompany(
    companyName: string,
    id: string,
    password: string,
  ): Promise<JobplanetCompanyData | null> {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

      const loggedIn = await this.login(page, id, password);
      if (!loggedIn) {
        this.logger.warn('[Jobplanet] 로그인 실패');
        return null;
      }

      return await this.scrapeCompanyData(page, companyName);
    } catch (err) {
      this.logger.error(`[Jobplanet] 스크래핑 오류: ${(err as Error).message}`);
      return null;
    } finally {
      await browser?.close();
    }
  }

  private async login(page: Page, id: string, password: string): Promise<boolean> {
    try {
      await page.goto('https://www.jobplanet.co.kr/users/sign_in', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // 이메일 입력
      await page.waitForSelector('#user_email, input[name="user[email]"]', { timeout: 8000 });
      await page.type('#user_email, input[name="user[email]"]', id, { delay: 50 });
      await page.type('#user_password, input[name="user[password]"]', password, { delay: 50 });

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
        page.click('input[type="submit"], button[type="submit"]'),
      ]);

      const currentUrl = page.url();
      // 로그인 성공 시 sign_in 페이지에서 벗어남
      return !currentUrl.includes('sign_in');
    } catch {
      return false;
    }
  }

  private async scrapeCompanyData(page: Page, companyName: string): Promise<JobplanetCompanyData | null> {
    try {
      // 회사 검색
      const searchUrl = `https://www.jobplanet.co.kr/companies?query=${encodeURIComponent(companyName)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.search_list_wrap, .company_item, [class*="company"]', { timeout: 8000 }).catch(() => {});

      // 첫 번째 회사 결과의 리뷰 링크 클릭
      const companyLink = await page.$eval(
        '.company_item a, .search_list_wrap li:first-child a, a[href*="/companies/"]',
        (el: Element) => (el as HTMLAnchorElement).href,
      ).catch(() => null);

      if (!companyLink) {
        this.logger.warn(`[Jobplanet] "${companyName}" 검색 결과 없음`);
        return null;
      }

      // 리뷰 페이지로 이동
      const reviewUrl = companyLink.includes('/reviews') ? companyLink : `${companyLink}/reviews`;
      await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.section_wrap, .review_card, [class*="review"]', { timeout: 8000 }).catch(() => {});

      return await page.evaluate((name: string) => {
        // 전체 평점
        const ratingEl = document.querySelector('.star_score, .score, [class*="rating_num"]');
        const overallRating = ratingEl ? parseFloat(ratingEl.textContent?.trim() ?? '0') || 0 : 0;

        // 리뷰 수
        const reviewCountEl = document.querySelector('[class*="review_count"], .count_wrap');
        const reviewCountText = reviewCountEl?.textContent?.replace(/[^0-9]/g, '') ?? '0';
        const reviewCount = parseInt(reviewCountText) || 0;

        // 복지 및 급여 정보
        const welfareEl = document.querySelector('[class*="welfare"], [class*="benefit"]');
        const welfare = welfareEl?.textContent?.trim() ?? '';

        // 세부 평점 (워라밸, 조직문화)
        const ratingItems = Array.from(document.querySelectorAll('[class*="rate_item"], .review_summary_item'));
        let wlbRating = '';
        let cultureRating = '';
        ratingItems.forEach((item) => {
          const label = item.querySelector('[class*="label"], .title')?.textContent?.trim() ?? '';
          const score = item.querySelector('[class*="score"], .rate')?.textContent?.trim() ?? '';
          if (label.includes('워라밸') || label.includes('밸런스')) wlbRating = score;
          if (label.includes('문화') || label.includes('조직')) cultureRating = score;
        });

        // 리뷰 목록 (최대 10개)
        const reviewEls = Array.from(document.querySelectorAll('.review_card, [class*="review_item"]')).slice(0, 10);
        const reviews = reviewEls.map((el) => {
          const title = el.querySelector('[class*="title"], .review_title')?.textContent?.trim() ?? '';
          const pros = el.querySelector('[class*="pros"], [class*="good"]')?.textContent?.trim() ?? '';
          const cons = el.querySelector('[class*="cons"], [class*="bad"]')?.textContent?.trim() ?? '';
          const ratingNum = el.querySelector('[class*="star"], [class*="rating"]')?.textContent?.trim() ?? '0';
          const date = el.querySelector('[class*="date"], time')?.textContent?.trim() ?? '';
          return {
            rating: parseFloat(ratingNum) || 0,
            title,
            pros,
            cons,
            date,
          };
        });

        // 전체 텍스트 요약 (AI 분석용)
        const mainContent = document.querySelector('.section_wrap, main, [class*="content_wrap"]');
        const rawSummary = mainContent?.textContent?.replace(/\s+/g, ' ').slice(0, 5000) ?? '';

        return {
          companyName: name,
          overallRating,
          reviewCount,
          welfare,
          cultureRating,
          wlbRating,
          reviews,
          rawSummary,
        };
      }, companyName);
    } catch (err) {
      this.logger.error(`[Jobplanet] 데이터 추출 오류: ${(err as Error).message}`);
      return null;
    }
  }

  /** 스크래핑 결과를 AI 분석용 텍스트로 변환 */
  formatForAnalysis(data: JobplanetCompanyData): string {
    const lines: string[] = [
      `## 잡플래닛 기업 리뷰 데이터: ${data.companyName}`,
      `- 전체 평점: ${data.overallRating}/5 (리뷰 ${data.reviewCount}개)`,
    ];
    if (data.wlbRating) lines.push(`- 워라밸: ${data.wlbRating}`);
    if (data.cultureRating) lines.push(`- 조직문화: ${data.cultureRating}`);
    if (data.welfare) lines.push(`- 복지 정보: ${data.welfare}`);

    if (data.reviews.length > 0) {
      lines.push('\n### 직원 리뷰 요약');
      data.reviews.slice(0, 5).forEach((r, i) => {
        lines.push(`\n**리뷰 ${i + 1}** (★${r.rating || '?'}) ${r.date}`);
        if (r.title) lines.push(`제목: ${r.title}`);
        if (r.pros) lines.push(`장점: ${r.pros}`);
        if (r.cons) lines.push(`단점: ${r.cons}`);
      });
    }

    if (data.rawSummary) {
      lines.push(`\n### 원문 요약\n${data.rawSummary.slice(0, 2000)}`);
    }

    return lines.join('\n');
  }
}
