import { Injectable, Logger } from '@nestjs/common';
import type { CookieData, Page } from 'puppeteer';
import {
  BrowserAutomationUtil,
  BrowserLogFn,
  INPUT_ACTION_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
} from '../browser/browser-automation.util';

const LOGIN_URL = 'https://www.jobplanet.co.kr/users/sign_in';
const HOME_URL = 'https://www.jobplanet.co.kr/';
const COOKIE_TTL_MS = 2 * 60 * 60 * 1000;

export interface JobplanetSessionResult {
  ok: boolean;
  reused: boolean;
  finalUrl?: string;
  error?: string;
  failedStep?: string;
}

@Injectable()
export class JobplanetAuthService {
  private readonly logger = new Logger(JobplanetAuthService.name);

  private savedCookies: CookieData[] | null = null;
  private cookiesSavedAt = 0;

  async loginWithSession(
    page: Page,
    id: string,
    password: string,
    onLog?: BrowserLogFn,
  ): Promise<JobplanetSessionResult> {
    if (this.savedCookies && Date.now() - this.cookiesSavedAt < COOKIE_TTL_MS) {
      onLog?.('저장된 잡플래닛 쿠키 세션 복원 시도');
      await page.browserContext().setCookie(...this.savedCookies);
      await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS });
      if (!this.isLoginUrl(page.url())) {
        this.logger.log('[Jobplanet] 쿠키 세션 복원 성공');
        onLog?.(`쿠키 세션 복원 성공: ${page.url()}`);
        return { ok: true, reused: true, finalUrl: page.url() };
      }
      this.logger.log('[Jobplanet] 쿠키 만료 - 재로그인');
      onLog?.('쿠키 세션 만료 또는 로그인 페이지 감지 - 신규 로그인 진행');
      this.savedCookies = null;
    }

    const result = await this.doFreshLogin(page, id, password, onLog);
    if (result.ok) {
      this.savedCookies = await page.browserContext().cookies() as CookieData[];
      this.cookiesSavedAt = Date.now();
      this.logger.log('[Jobplanet] 로그인 완료 - 쿠키 저장됨');
      onLog?.(`신규 로그인 성공 - 쿠키 ${this.savedCookies.length}개 저장`);
    }
    return { ...result, reused: false };
  }

  private async doFreshLogin(
    page: Page,
    id: string,
    password: string,
    onLog?: BrowserLogFn,
  ): Promise<Omit<JobplanetSessionResult, 'reused'>> {
    try {
      onLog?.(`로그인 페이지 이동: ${LOGIN_URL}`);
      await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS });
      const initialDiagnostics = await BrowserAutomationUtil.getPageDiagnostics(page);
      onLog?.(`로그인 페이지 로드 완료: title="${initialDiagnostics.title}", url=${initialDiagnostics.url}`);
      if (BrowserAutomationUtil.isBlockedPage(initialDiagnostics)) {
        onLog?.(`잡플래닛 접근 차단 페이지 감지: ${initialDiagnostics.sample || '본문 없음'}`);
        return {
          ok: false,
          finalUrl: initialDiagnostics.url,
          failedStep: '접근 차단',
          error: '잡플래닛이 현재 서버/브라우저 요청을 Cloudflare 보안 정책으로 차단했습니다.',
        };
      }

      const openedEmailForm = await BrowserAutomationUtil.clickTextButton(page, [/이메일.*로그인/, /email.*login/, /로그인.*이메일/]);
      if (openedEmailForm) onLog?.('이메일 로그인 버튼/탭 클릭');

      const apiLoginResult = await this.loginViaApi(page, id, password, onLog);
      if (apiLoginResult.ok) {
        return { ok: true, finalUrl: apiLoginResult.finalUrl };
      }
      if (apiLoginResult.attempted && apiLoginResult.status === 401) {
        return {
          ok: false,
          finalUrl: apiLoginResult.finalUrl ?? page.url(),
          failedStep: apiLoginResult.failedStep,
          error: apiLoginResult.error,
        };
      }
      if (apiLoginResult.attempted) {
        onLog?.('API 로그인 실패 - DOM 입력 방식으로 fallback');
      }

      onLog?.('이메일 입력 필드 탐색');
      const emailOk = await BrowserAutomationUtil.fillInput(page, [
        'input[name="email"]',
        'input[type="email"]',
        'input[name="user[email]"]',
        '#user_email',
        'input[id*="email" i]',
        'input[autocomplete="email"]',
        'input[placeholder*="이메일"]',
        'input[placeholder*="email" i]',
      ], id, onLog, this.logger, 'Jobplanet');
      if (!emailOk) {
        const diagnostics = await BrowserAutomationUtil.getPageDiagnostics(page);
        onLog?.(`이메일 입력 필드 없음 - title="${diagnostics.title}", url=${diagnostics.url}`);
        onLog?.(`페이지 input 후보: ${diagnostics.inputs.length ? diagnostics.inputs.join(' | ') : '없음'}`);
        onLog?.(`페이지 본문 샘플: ${diagnostics.sample || '본문 없음'}`);
        return { ok: false, finalUrl: diagnostics.url, failedStep: '이메일 입력', error: '이메일 입력 필드를 찾을 수 없습니다.' };
      }

      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[placeholder*="비밀번호"]',
        'input[name="user[password]"]',
        '#user_password',
        'input[id*="password" i]',
        'input[autocomplete="current-password"]',
        'input[placeholder*="password" i]',
      ];
      await this.advanceToPasswordStep(page, passwordSelectors, onLog);

      onLog?.('비밀번호 입력 필드 탐색');
      const pwOk = await BrowserAutomationUtil.fillInput(page, passwordSelectors, password, onLog, this.logger, 'Jobplanet');
      if (!pwOk) {
        const diagnostics = await BrowserAutomationUtil.getPageDiagnostics(page);
        onLog?.(`비밀번호 입력 필드 없음 - title="${diagnostics.title}", url=${diagnostics.url}`);
        onLog?.(`페이지 input 후보: ${diagnostics.inputs.length ? diagnostics.inputs.join(' | ') : '없음'}`);
        onLog?.(`페이지 본문 샘플: ${diagnostics.sample || '본문 없음'}`);
        return { ok: false, finalUrl: diagnostics.url, failedStep: '비밀번호 입력', error: '비밀번호 입력 필드를 찾을 수 없습니다.' };
      }

      onLog?.('Enter 키로 로그인 제출');
      await BrowserAutomationUtil.withTimeout(page.keyboard.press('Enter'), INPUT_ACTION_TIMEOUT_MS, '로그인 Enter 제출 시간 초과');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});

      if (this.isLoginUrl(page.url())) {
        onLog?.('로그인 페이지에 머물러 있어 submit 버튼 클릭 재시도');
        await BrowserAutomationUtil.submitForm(page, [
          'input[type="submit"]', 'button[type="submit"]',
          'input[type="submit"][name="commit"]', '.btn_login', 'form button',
        ], this.logger, 'Jobplanet');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5_000 }).catch(() => {});
      }

      const finalUrl = page.url();
      const ok = !this.isLoginUrl(finalUrl);
      this.logger.log(`[Jobplanet] 로그인 ${ok ? '성공' : '실패'} - ${finalUrl}`);
      onLog?.(`로그인 최종 URL 확인: ${finalUrl}`);

      if (!ok) {
        const errMsg = await page.$eval(
          '.error-message, .alert, [class*="error"], [class*="alert"]',
          (el) => el.textContent?.trim() ?? '',
        ).catch(() => '');
        onLog?.(`로그인 실패 메시지: ${errMsg || 'ID/비밀번호 오류 또는 접근 차단'}`);
        return { ok: false, finalUrl, failedStep: '로그인 실패', error: errMsg || 'ID/비밀번호 오류 또는 접근 차단' };
      }

      return { ok: true, finalUrl };
    } catch (err) {
      this.logger.warn(`[Jobplanet] 로그인 오류: ${(err as Error).message}`);
      onLog?.(`로그인 중 예외 발생: ${(err as Error).message}`);
      return { ok: false, failedStep: '로그인', error: (err as Error).message };
    }
  }

  private async advanceToPasswordStep(page: Page, passwordSelectors: string[], onLog?: BrowserLogFn): Promise<boolean> {
    if (await BrowserAutomationUtil.hasVisibleSelector(page, passwordSelectors)) {
      onLog?.('비밀번호 입력 필드가 현재 화면에 이미 표시됨');
      return true;
    }

    onLog?.('이메일 입력 후 Enter로 비밀번호 단계 전환 시도');
    await page.keyboard.press('Enter');
    await BrowserAutomationUtil.waitBrieflyForNavigation(page);
    if (await BrowserAutomationUtil.hasVisibleSelector(page, passwordSelectors)) {
      onLog?.('Enter 후 비밀번호 입력 필드 표시 확인');
      return true;
    }

    onLog?.('다음/계속/로그인 버튼으로 비밀번호 단계 전환 시도');
    const clickedTextButton = await BrowserAutomationUtil.clickTextButton(page, [
      /다음/,
      /계속/,
      /로그인/,
      /이메일.*계속/,
      /continue/,
      /next/,
      /sign\s*in/,
      /log\s*in/,
    ]);
    if (clickedTextButton) {
      await BrowserAutomationUtil.waitBrieflyForNavigation(page);
      if (await BrowserAutomationUtil.hasVisibleSelector(page, passwordSelectors)) {
        onLog?.('버튼 클릭 후 비밀번호 입력 필드 표시 확인');
        return true;
      }
    }

    const clickedSubmit = await BrowserAutomationUtil.submitForm(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'form button',
      '.btn_login',
      '[class*="submit"]',
    ], this.logger, 'Jobplanet');
    if (clickedSubmit) {
      onLog?.('submit 버튼으로 비밀번호 단계 전환 시도');
      await BrowserAutomationUtil.waitBrieflyForNavigation(page);
      if (await BrowserAutomationUtil.hasVisibleSelector(page, passwordSelectors)) {
        onLog?.('submit 후 비밀번호 입력 필드 표시 확인');
        return true;
      }
    }

    return false;
  }

  private async loginViaApi(
    page: Page,
    id: string,
    password: string,
    onLog?: BrowserLogFn,
  ): Promise<{ attempted: boolean; ok: boolean; finalUrl?: string; status?: number; error?: string; failedStep?: string }> {
    try {
      const csrfToken = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
        return meta?.content || '';
      }).catch(() => '');

      if (!csrfToken) {
        onLog?.('API 로그인 건너뜀: CSRF 토큰을 찾지 못함');
        return { attempted: false, ok: false };
      }

      onLog?.('API 로그인 시도: /users/sign_in');
      const apiResult = await page.evaluate(async ({ email, pw, token }) => {
        const response = await fetch('/users/sign_in', {
          method: 'POST',
          credentials: 'include',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({
            user: { email, password: pw, remember_me: true },
            _nav: 'gb',
          }),
        });
        const text = await response.text().catch(() => '');
        return {
          ok: response.ok,
          status: response.status,
          redirected: response.redirected,
          url: response.url,
          text: text.slice(0, 300),
        };
      }, { email: id, pw: password, token: csrfToken });

      onLog?.(`API 로그인 응답: HTTP ${apiResult.status}`);

      if (!apiResult.ok) {
        const error = apiResult.status === 401
          ? 'ID/비밀번호가 올바르지 않거나 잡플래닛이 로그인을 거부했습니다.'
          : `API 로그인 실패 (HTTP ${apiResult.status})`;
        if (apiResult.text) onLog?.(`API 로그인 응답 본문 샘플: ${apiResult.text}`);
        return { attempted: true, ok: false, status: apiResult.status, failedStep: 'API 로그인', error };
      }

      await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
      const finalUrl = page.url();
      const ok = !this.isLoginUrl(finalUrl);
      onLog?.(`API 로그인 후 세션 확인 URL: ${finalUrl}`);
      return {
        attempted: true,
        ok,
        status: apiResult.status,
        finalUrl,
        failedStep: ok ? undefined : 'API 로그인 세션 확인',
        error: ok ? undefined : 'API 응답은 성공했지만 로그인 세션을 확인하지 못했습니다.',
      };
    } catch (err) {
      onLog?.(`API 로그인 예외: ${(err as Error).message}`);
      return { attempted: true, ok: false, failedStep: 'API 로그인', error: (err as Error).message };
    }
  }

  private isLoginUrl(url: string): boolean {
    return url.includes('sign_in') || url.includes('user-session/sign-in');
  }
}
