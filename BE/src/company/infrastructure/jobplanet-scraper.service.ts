import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import {
  BrowserAutomationUtil,
  BrowserLogFn,
  BROWSER_LAUNCH_OPTIONS,
} from '../../browse/infrastructure/browser-automation.util';
import { JobplanetAuthService } from '../../browse/infrastructure/auth/jobplanet-auth.service';

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

export interface JobplanetLoginResult {
  success: boolean;
  finalUrl?: string;
  error?: string;
  failedStep?: string;
  sessionReused?: boolean;
}

type JobplanetLogFn = BrowserLogFn;

@Injectable()
export class JobplanetScraperService {
  private readonly logger = new Logger(JobplanetScraperService.name);

  constructor(private readonly jobplanetAuth: JobplanetAuthService) {}

  // ── 로그인 테스트 (진단용) ──────────────────────────────────────────────
  async testLogin(id: string, password: string, onLog?: JobplanetLogFn): Promise<JobplanetLoginResult> {
    let browser: Browser | null = null;
    try {
      onLog?.('브라우저 실행 중');
      browser = await puppeteer.launch(BROWSER_LAUNCH_OPTIONS);
      const page = await browser.newPage();
      await BrowserAutomationUtil.setupPage(page);
      onLog?.('브라우저 페이지 설정 완료');

      const { ok, reused, finalUrl, error, failedStep } = await this.jobplanetAuth.loginWithSession(page, id, password, onLog);
      if (!ok) {
        onLog?.(`로그인 실패: ${failedStep ?? '알 수 없는 단계'}${error ? ` - ${error}` : ''}`);
        return { success: false, finalUrl, error, failedStep };
      }
      onLog?.(`로그인 성공${reused ? ' (저장된 세션 사용)' : ''}: ${finalUrl ?? page.url()}`);
      return { success: true, finalUrl: finalUrl ?? page.url(), sessionReused: reused };
    } catch (err) {
      this.logger.warn(`[Jobplanet] testLogin 오류: ${(err as Error).message}`);
      onLog?.(`브라우저 실행 또는 로그인 테스트 오류: ${(err as Error).message}`);
      return { success: false, failedStep: '브라우저 실행', error: (err as Error).message };
    } finally {
      await browser?.close();
      onLog?.('브라우저 종료');
    }
  }

  // ── 페이지 구조 디버깅 ─────────────────────────────────────────────────
  async debugPage(id: string, password: string, companyName: string): Promise<{
    loginUrl: string;
    searchUrl: string;
    reviewUrl: string;
    pageTitle: string;
    innerTextSample: string;
    foundLinks: string[];
    classNames: string[];
  }> {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch(BROWSER_LAUNCH_OPTIONS);
      const page = await browser.newPage();
      await BrowserAutomationUtil.setupPage(page);

      await this.jobplanetAuth.loginWithSession(page, id, password);
      const loginUrl = page.url();

      const searchUrl = `https://www.jobplanet.co.kr/search?query=${encodeURIComponent(companyName)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      // 실제 페이지에서 /companies/ 링크 수집
      const foundLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/companies/"]'))
          .map((a) => (a as HTMLAnchorElement).href)
          .slice(0, 10),
      );

      const companyLink = foundLinks.find((l) => l.includes('/companies/')) ?? null;
      const reviewUrl = companyLink ? companyLink.replace(/\/$/, '') + '/reviews' : searchUrl;

      await page.goto(reviewUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      const pageTitle = await page.title();
      const innerTextSample = await page.evaluate(() =>
        (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 3000),
      );

      // 실제 사용된 class 이름 샘플 수집
      const classNames = await page.evaluate(() => {
        const set = new Set<string>();
        document.querySelectorAll('[class]').forEach((el) => {
          (el.getAttribute('class') ?? '').split(/\s+/).forEach((c) => {
            if (c && (c.includes('review') || c.includes('rating') || c.includes('star') || c.includes('score') || c.includes('company'))) {
              set.add(c);
            }
          });
        });
        return Array.from(set).slice(0, 50);
      });

      return { loginUrl, searchUrl, reviewUrl, pageTitle, innerTextSample, foundLinks, classNames };
    } finally {
      await browser?.close();
    }
  }

  // ── 기업 스크래핑 (분석용) ─────────────────────────────────────────────
  // ── 공식 웹사이트 탐색 (Puppeteer + Naver) ────────────────────────────
  async findOfficialWebsite(companyName: string): Promise<string | null> {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch(BROWSER_LAUNCH_OPTIONS);
      const page = await browser.newPage();
      await BrowserAutomationUtil.setupPage(page);

      const EXCLUDE = [
        'naver.com', 'daum.net', 'kakao.com', 'google.', 'bing.com',
        'youtube.', 'wikipedia.', 'namu.wiki',
        'linkedin.', 'facebook.', 'instagram.', 'twitter.', 'x.com',
        'saramin', 'jobkorea', 'wanted', 'incruit', 'catch.co', 'jumpit',
        'yna.co.kr', 'yonhap', 'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr',
        'chosun.com', 'joongang', 'hani.co.kr', 'donga.com', 'khan.co.kr',
        'edaily', 'etnews', 'zdnet', 'news', 'media',
      ];

      // ── 1차: Naver 지식패널 "홈페이지" 링크 ──────────────────────────
      const naverUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(companyName)}`;
      await page.goto(naverUrl, { waitUntil: 'networkidle2', timeout: 15000 });

      const panelLink = await page.evaluate((exclude: string[]) => {
        // 네이버 지식패널 홈페이지 링크: "홈페이지" 텍스트 근처의 a 태그
        const allLinks = Array.from(document.querySelectorAll('a[href^="http"]'));
        for (const a of allLinks) {
          const el = a as HTMLAnchorElement;
          const parent = el.closest('li, dt, dd, div');
          const parentText = parent?.textContent ?? '';
          if (/홈페이지|공식\s*사이트|official/i.test(parentText)) {
            if (!exclude.some((p) => el.href.includes(p))) return el.href;
          }
        }
        return null;
      }, EXCLUDE);

      if (panelLink) {
        this.logger.log(`[Scraper] 공식 웹사이트(패널): ${panelLink}`);
        return panelLink;
      }

      // ── 2차: Naver 검색 "공식 홈페이지" 쿼리 첫 결과 ─────────────────
      const naverUrl2 = `https://search.naver.com/search.naver?query=${encodeURIComponent(companyName + ' 공식 홈페이지')}`;
      await page.goto(naverUrl2, { waitUntil: 'networkidle2', timeout: 15000 });

      const firstResult = await page.evaluate((exclude: string[], name: string) => {
        const norm = (s: string) => s.replace(/[\s(주)㈜()]/g, '').toLowerCase();
        const links = Array.from(document.querySelectorAll('a.link_tit[href^="http"], a.total_tit[href^="http"], .api_subject_bx a[href^="http"], .source_box a[href^="http"]'));
        for (const a of links) {
          const href = (a as HTMLAnchorElement).href;
          if (exclude.some((p) => href.includes(p))) continue;
          return href;
        }
        // 마지막 fallback: 도메인에 기업명 포함되는 첫 번째 외부 링크
        const allExt = Array.from(document.querySelectorAll('a[href^="http"]'));
        for (const a of allExt) {
          const href = (a as HTMLAnchorElement).href;
          if (exclude.some((p) => href.includes(p))) continue;
          try {
            const domain = new URL(href).hostname.replace('www.', '');
            if (norm(domain).includes(norm(name).slice(0, 3))) return href;
          } catch { /* skip */ }
        }
        return null;
      }, EXCLUDE, companyName);

      if (firstResult) {
        this.logger.log(`[Scraper] 공식 웹사이트(검색): ${firstResult}`);
        return firstResult;
      }

      this.logger.warn(`[Scraper] "${companyName}" 공식 웹사이트 탐색 실패`);
      return null;
    } catch (err) {
      this.logger.warn(`[Scraper] 공식 웹사이트 탐색 오류: ${(err as Error).message}`);
      return null;
    } finally {
      await browser?.close();
    }
  }

  // ── 기업 스크래핑 (분석용) ─────────────────────────────────────────────
  async scrapeCompany(
    companyName: string,
    id: string,
    password: string,
    onLog?: JobplanetLogFn,
  ): Promise<JobplanetCompanyData | null> {
    let browser: Browser | null = null;
    try {
      onLog?.('기업 리뷰 수집용 브라우저 실행 중');
      browser = await puppeteer.launch(BROWSER_LAUNCH_OPTIONS);
      const page = await browser.newPage();
      await BrowserAutomationUtil.setupPage(page);
      onLog?.('기업 리뷰 수집용 페이지 설정 완료');

      const { ok, finalUrl, failedStep, error } = await this.jobplanetAuth.loginWithSession(page, id, password, onLog);
      if (!ok) {
        this.logger.warn('[Jobplanet] 로그인 실패 — 스크래핑 중단');
        onLog?.(`로그인 실패로 수집 중단: ${failedStep ?? '로그인'}${error ? ` - ${error}` : ''}`);
        return null;
      }
      onLog?.(`수집 전 로그인 확인 완료: ${finalUrl ?? page.url()}`);

      return await this.scrapeCompanyData(page, companyName, onLog);
    } catch (err) {
      this.logger.error(`[Jobplanet] 스크래핑 오류: ${(err as Error).message}`);
      onLog?.(`스크래핑 오류: ${(err as Error).message}`);
      return null;
    } finally {
      await browser?.close();
      onLog?.('기업 리뷰 수집용 브라우저 종료');
    }
  }

  /** /companies/{id}/landing/{slug} → /companies/{id}/reviews/{slug} */
  private toReviewUrl(href: string): string {
    try {
      const url = new URL(href);
      const parts = url.pathname.split('/').filter(Boolean);
      // parts: ['companies', '89520', 'landing', 'slug']
      if (parts[0] === 'companies' && parts[1]) {
        const id = parts[1];
        const slug = parts.slice(3).join('/');
        url.pathname = slug ? `/companies/${id}/reviews/${slug}` : `/companies/${id}/reviews`;
        url.search = '';
        return url.toString();
      }
    } catch { /* fallback below */ }
    return href.replace(/\/companies\/(\d+)\/[^/]+\/(.+)/, '/companies/$1/reviews/$2')
               .replace(/\/companies\/(\d+)(?:\/[^/]*)?$/, '/companies/$1/reviews');
  }

  private async scrapeCompanyData(page: Page, companyName: string, onLog?: JobplanetLogFn): Promise<JobplanetCompanyData | null> {
    try {
      // /search?query= 가 올바른 검색 엔드포인트 (/companies?query= 는 랭킹 홈 리다이렉트)
      const searchUrl = `https://www.jobplanet.co.kr/search?query=${encodeURIComponent(companyName)}`;
      onLog?.(`기업 검색 페이지 이동: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      // 회사 링크 추출 — 빈 텍스트 앵커와 사이드바 링크 제외
      const { companyLink, allLinks } = await page.evaluate((query) => {
        const norm = (s: string) => s.replace(/[\s(주)㈜()（）\.,·]/g, '').toLowerCase();
        const qNorm = norm(query);

        const anchors = Array.from(document.querySelectorAll('a[href*="/companies/"]'))
          .filter((a) => /\/companies\/\d+/.test((a as HTMLAnchorElement).href)); // 숫자 ID가 있는 실제 기업 페이지만

        const allLinks = anchors.slice(0, 15).map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: a.textContent?.trim().slice(0, 30) ?? '',
        }));

        // 1순위: 정규화 후 정확 일치 또는 시작
        let match = anchors.find((a) => {
          const t = norm(a.textContent?.trim() ?? '');
          return t && (t === qNorm || t.startsWith(qNorm) || qNorm.startsWith(t));
        });

        // 2순위: 포함 관계 (단, 텍스트 비어있으면 제외)
        if (!match) {
          match = anchors.find((a) => {
            const t = a.textContent?.trim() ?? '';
            return t.length > 0 && (t.includes(query) || query.includes(t));
          });
        }

        // 3순위: 첫 번째 숫자ID 링크 (검색결과 페이지 최상단)
        if (!match) match = anchors[0];

        return {
          companyLink: match ? (match as HTMLAnchorElement).href : null,
          allLinks,
        };
      }, companyName);

      this.logger.log(`[Jobplanet] 검색 링크 후보: ${JSON.stringify(allLinks)}`);
      this.logger.log(`[Jobplanet] 선택된 링크: ${companyLink}`);
      onLog?.(`기업 링크 후보 ${allLinks.length}개 탐색`);
      onLog?.(`선택된 기업 링크: ${companyLink ?? '없음'}`);

      if (!companyLink) {
        this.logger.warn(`[Jobplanet] "${companyName}" 기업 링크 없음`);
        onLog?.(`"${companyName}" 기업 링크를 찾지 못함`);
        return null;
      }

      // /companies/{id}/reviews/{slug} 형태로 리뷰 페이지 이동
      const reviewUrl = this.toReviewUrl(companyLink);
      this.logger.log(`[Jobplanet] 리뷰 URL: ${reviewUrl}`);
      onLog?.(`리뷰 페이지 이동: ${reviewUrl}`);
      await page.goto(reviewUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      // JS 렌더링 대기 + 스크롤로 지연 로딩 리뷰 유도
      onLog?.('리뷰 페이지 렌더링 대기 및 스크롤 로딩 시작');
      await new Promise<void>((r) => setTimeout(r, 2000));
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      await new Promise<void>((r) => setTimeout(r, 1000));

      // 페이지 전체 텍스트 기반 추출 + 가능한 셀렉터 모두 시도
      const data = await page.evaluate((name) => {
        // ── 전체 텍스트 ───────────────────────────────────────────
        const rawSummary = (document.body.innerText ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 80000);

        // ── 기업 본문 시작 위치 파악 (사이드바/랭킹 건너뜀) ──────
        // "전체 리뷰 통계" 또는 "전체 통계" 섹션부터가 실제 기업 데이터
        let bodyStart = rawSummary.search(/전체\s*(리뷰\s*)?통계/);
        if (bodyStart === -1) {
          // fallback: 기업명 위치
          bodyStart = rawSummary.indexOf(name);
        }
        const body = bodyStart > 0 ? rawSummary.slice(bodyStart) : rawSummary;

        // ── 종합 평점 ─────────────────────────────────────────────
        // "전체 리뷰 통계 (N명)\n3.8" 패턴
        const overallM = body.match(/통계\s*\(\d[\d,]*명\)\s*\n?\s*([1-5]\.[0-9])/);
        let overallRating = overallM ? parseFloat(overallM[1]) : 0;
        if (!overallRating) {
          const m = body.match(/([1-5]\.[0-9])/);
          if (m) overallRating = parseFloat(m[1]);
        }

        // ── 세부 평점 ─────────────────────────────────────────────
        const subRatingM = (label: string) => body.match(new RegExp(label + '\\s*\\n?\\s*([1-5]\\.[0-9])'));
        const welfareScore  = subRatingM('복지\\/급여')?.[1] ?? '';
        const wlbRating     = subRatingM('워라밸')?.[1] ?? '';
        const cultureRating = subRatingM('사내문화')?.[1] ?? '';
        const promotionScore = subRatingM('승진\\s*기회')?.[1] ?? '';
        const mgmtScore     = subRatingM('경영진')?.[1] ?? '';
        const recommendM    = body.match(/(\d{1,3})%\s*기업\s*추천율/);

        const welfareParts: string[] = [];
        if (welfareScore)  welfareParts.push(`복지/급여 ${welfareScore}`);
        if (wlbRating)     welfareParts.push(`워라밸 ${wlbRating}`);
        if (cultureRating) welfareParts.push(`사내문화 ${cultureRating}`);
        if (promotionScore) welfareParts.push(`승진기회 ${promotionScore}`);
        if (mgmtScore)     welfareParts.push(`경영진 ${mgmtScore}`);
        if (recommendM)    welfareParts.push(`기업추천율 ${recommendM[1]}%`);
        const welfare = welfareParts.join(' | ');

        // ── 리뷰 수 ──────────────────────────────────────────────
        // "전체 리뷰 통계 (2,953명)" 패턴에서 추출
        let reviewCount = 0;
        const countM = body.match(/통계\s*\((\d[\d,]+)명\)/);
        if (countM) {
          reviewCount = parseInt(countM[1].replace(/,/g, ''));
        } else {
          // fallback: rawSummary 탭 레이블 "리뷰 2,953" 형식
          const fallbackM = rawSummary.match(/리뷰\s+(\d[\d,]+)/);
          if (fallbackM) reviewCount = parseInt(fallbackM[1].replace(/,/g, ''));
        }

        // ── 개별 리뷰 — "YYYY. MM 작성" 기준으로 블록 분할 ──────
        // 실제 구조:
        //   YYYY. MM 작성
        //   4.0
        //   승진 기회 / 복지/급여 / 워라밸 / 사내문화 / 경영진
        //   [리뷰 제목]
        //   장점
        //   [내용]
        //   단점
        //   [내용]
        //   경영진에 바라는 점
        //   [내용]
        const reviewBlocks = rawSummary.split(/(?=\d{4}\.\s*\d{2}\s*작성)/).slice(1, 31);

        const reviews = reviewBlocks.map((block) => {
          const dateM2   = block.match(/(\d{4}\.\s*\d{2})\s*작성/);
          const ratingM2 = block.match(/작성\s*\n?\s*([1-5]\.[0-9])/);
          // 제목: "경영진" 레이블 이후, "장점" 이전의 한 줄
          const titleM   = block.match(/경영진\s*\n([\s\S]{1,100}?)\n장점/);
          const prosM    = block.match(/장점\s*\n([\s\S]{1,300}?)\n단점/);
          const consM    = block.match(/단점\s*\n([\s\S]{1,300}?)(?:\n경영진에|\n1년\s*후|\n기업을|$)/);

          return {
            title:  (titleM?.[1] ?? '').replace(/\s+/g, ' ').trim(),
            pros:   (prosM?.[1]  ?? '').replace(/\s+/g, ' ').trim(),
            cons:   (consM?.[1]  ?? '').replace(/\s+/g, ' ').trim(),
            rating: ratingM2 ? parseFloat(ratingM2[1]) : 0,
            date:   dateM2 ? dateM2[1].replace(/\s/g, '') : '',
          };
        }).filter((r) => r.pros || r.cons);

        return {
          companyName: name,
          overallRating,
          reviewCount,
          welfare,
          cultureRating,
          wlbRating,
          reviews,
          // 리뷰 파싱 실패 시 AI가 원문을 직접 분석할 수 있도록 반환
          rawSummary: reviews.length === 0 ? rawSummary.slice(0, 20000) : '',
        };
      }, companyName);

      this.logger.log(`[Jobplanet] 수집 완료 — 평점: ${data.overallRating}, 리뷰: ${data.reviewCount}개, 추출: ${data.reviews.length}건`);
      onLog?.(`데이터 추출 완료 — 평점 ${data.overallRating}, 리뷰 ${data.reviewCount}개, 미리보기 ${data.reviews.length}건`);

      return data;
    } catch (err) {
      this.logger.error(`[Jobplanet] 데이터 추출 오류: ${(err as Error).message}`);
      onLog?.(`데이터 추출 오류: ${(err as Error).message}`);
      return null;
    }
  }

  /** 리뷰 페이지 원문 + 추출 결과 디버그 (셀렉터 튜닝용) */
  async debugReviews(
    id: string,
    password: string,
    companyName: string,
  ): Promise<{
    reviewUrl: string;
    rawTextSample: string;       // 본문 앞 5000자
    reviewBlockCount: number;
    firstBlock: string;          // 첫 번째 리뷰 블록 원문
    extracted: JobplanetCompanyData | null;
  }> {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch(BROWSER_LAUNCH_OPTIONS);
      const page = await browser.newPage();
      await BrowserAutomationUtil.setupPage(page);

      await this.jobplanetAuth.loginWithSession(page, id, password);

      const searchUrl = `https://www.jobplanet.co.kr/search?query=${encodeURIComponent(companyName)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      const companyLink = await page.evaluate((query) => {
        const norm = (s: string) => s.replace(/[\s(주)㈜()（）\.,·]/g, '').toLowerCase();
        const qNorm = norm(query);
        const anchors = Array.from(document.querySelectorAll('a[href*="/companies/"]'))
          .filter((el) => /\/companies\/\d+/.test((el as HTMLAnchorElement).href));
        const match = anchors.find((a) => {
          const t = norm(a.textContent?.trim() ?? '');
          return t && (t === qNorm || t.startsWith(qNorm) || qNorm.startsWith(t));
        }) ?? anchors.find((a) => {
          const t = a.textContent?.trim() ?? '';
          return t.length > 0 && (t.includes(query) || query.includes(t));
        }) ?? anchors[0];
        return match ? (match as HTMLAnchorElement).href : null;
      }, companyName);

      const reviewUrl = companyLink ? this.toReviewUrl(companyLink) : searchUrl;
      this.logger.log(`[Jobplanet-Debug] 선택 링크: ${companyLink} → 리뷰: ${reviewUrl}`);

      await page.goto(reviewUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise<void>((r) => setTimeout(r, 2000));
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      await new Promise<void>((r) => setTimeout(r, 1000));

      const { rawText, blockCount, firstBlock } = await page.evaluate(() => {
        const raw = (document.body.innerText ?? '').replace(/[ \t]+/g, ' ').trim();
        const blocks = raw.split(/(?=\d{4}\.\s*\d{2}\s*작성)/).slice(1);
        return {
          rawText: raw.slice(0, 5000),
          blockCount: blocks.length,
          firstBlock: blocks[0]?.slice(0, 800) ?? '',
        };
      });

      const extracted = await this.scrapeCompanyData(page, companyName);

      return { reviewUrl, rawTextSample: rawText, reviewBlockCount: blockCount, firstBlock, extracted };
    } finally {
      await browser?.close();
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
      data.reviews.slice(0, 30).forEach((r, i) => {
        lines.push(`\n**리뷰 ${i + 1}** (★${r.rating || '?'}) ${r.date}`);
        if (r.title) lines.push(`제목: ${r.title}`);
        if (r.pros) lines.push(`장점: ${r.pros.slice(0, 200)}`);
        if (r.cons) lines.push(`단점: ${r.cons.slice(0, 200)}`);
      });
    } else if (data.rawSummary) {
      // 구조화 파싱 실패 시 원문을 AI에게 직접 전달
      lines.push('\n### 페이지 원문 (구조 파싱 실패 — AI 직접 분석)');
      lines.push(data.rawSummary);
    }

    return lines.join('\n');
  }
}
