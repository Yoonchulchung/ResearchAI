import { Injectable, Logger } from '@nestjs/common';
import type { CookieData, Page } from 'puppeteer';
import {
  BrowserAutomationUtil,
  BrowserLogFn,
  NAVIGATION_TIMEOUT_MS,
} from '../browser/browser-automation.util';

const LOGIN_URL = 'https://www.catch.co.kr/Member/Login?ReturnURL=%2F';
const HOME_URL = 'https://www.catch.co.kr/';
const COOKIE_TTL_MS = 2 * 60 * 60 * 1000;

export interface CatchSessionResult {
  ok: boolean;
  reused: boolean;
  finalUrl?: string;
  error?: string;
  failedStep?: string;
}

@Injectable()
export class CatchAuthService {
  private readonly logger = new Logger(CatchAuthService.name);

  private savedCookies: CookieData[] | null = null;
  private cookiesSavedAt = 0;

  async loginWithSession(
    page: Page,
    id: string,
    password: string,
    onLog?: BrowserLogFn,
  ): Promise<CatchSessionResult> {
    if (this.savedCookies && Date.now() - this.cookiesSavedAt < COOKIE_TTL_MS) {
      onLog?.('저장된 캐치 쿠키 세션 복원 시도');
      await page.browserContext().setCookie(...this.savedCookies);
      await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS });
      if (await this.isLoggedIn(page)) {
        this.logger.log('[Catch] 쿠키 세션 복원 성공');
        onLog?.(`캐치 쿠키 세션 복원 성공: ${page.url()}`);
        return { ok: true, reused: true, finalUrl: page.url() };
      }
      this.logger.log('[Catch] 쿠키 만료 - 재로그인');
      onLog?.('캐치 쿠키 세션 만료 또는 비로그인 상태 감지 - 신규 로그인 진행');
      this.savedCookies = null;
    }

    const result = await this.doFreshLogin(page, id, password, onLog);
    if (result.ok) {
      this.savedCookies = await page.browserContext().cookies() as CookieData[];
      this.cookiesSavedAt = Date.now();
      this.logger.log('[Catch] 로그인 완료 - 쿠키 저장됨');
      onLog?.(`캐치 신규 로그인 성공 - 쿠키 ${this.savedCookies.length}개 저장`);
    }
    return { ...result, reused: false };
  }

  private async doFreshLogin(
    page: Page,
    id: string,
    password: string,
    onLog?: BrowserLogFn,
  ): Promise<Omit<CatchSessionResult, 'reused'>> {
    try {
      onLog?.(`캐치 로그인 페이지 이동: ${LOGIN_URL}`);
      await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS });
      const diagnostics = await BrowserAutomationUtil.getPageDiagnostics(page);
      onLog?.(`캐치 로그인 페이지 로드 완료: title="${diagnostics.title}", url=${diagnostics.url}`);
      if (BrowserAutomationUtil.isBlockedPage(diagnostics)) {
        return {
          ok: false,
          finalUrl: diagnostics.url,
          failedStep: '접근 차단',
          error: '캐치가 현재 서버/브라우저 요청을 보안 정책으로 차단했습니다.',
        };
      }

      const apiResult = await this.loginViaApi(page, id, password, onLog);
      if (apiResult.ok) return { ok: true, finalUrl: apiResult.finalUrl };
      if (apiResult.attempted) onLog?.('캐치 API 로그인 실패 - DOM 입력 방식으로 fallback');

      const idOk = await BrowserAutomationUtil.fillInput(page, [
        '#id_login',
        'input[id="id_login"]',
        'input[name="jobID"]',
        'input[name="id"]',
        'input[type="text"][placeholder*="아이디"]',
        'input[placeholder*="아이디"]',
        'input[autocomplete="username"]',
      ], id, onLog, this.logger, 'Catch');
      if (!idOk) {
        const nextDiagnostics = await BrowserAutomationUtil.getPageDiagnostics(page);
        onLog?.(`캐치 아이디 입력 필드 없음 - input 후보: ${nextDiagnostics.inputs.join(' | ') || '없음'}`);
        return { ok: false, finalUrl: nextDiagnostics.url, failedStep: '아이디 입력', error: '캐치 아이디 입력 필드를 찾을 수 없습니다.' };
      }

      const pwOk = await BrowserAutomationUtil.fillInput(page, [
        '#pw_login',
        'input[id="pw_login"]',
        'input[name="jobPwd"]',
        'input[name="password"]',
        'input[type="password"]',
        'input[placeholder*="비밀번호"]',
        'input[autocomplete="current-password"]',
      ], password, onLog, this.logger, 'Catch');
      if (!pwOk) {
        const nextDiagnostics = await BrowserAutomationUtil.getPageDiagnostics(page);
        onLog?.(`캐치 비밀번호 입력 필드 없음 - input 후보: ${nextDiagnostics.inputs.join(' | ') || '없음'}`);
        return { ok: false, finalUrl: nextDiagnostics.url, failedStep: '비밀번호 입력', error: '캐치 비밀번호 입력 필드를 찾을 수 없습니다.' };
      }

      onLog?.('캐치 로그인 버튼 클릭');
      const clicked = await BrowserAutomationUtil.clickTextButton(page, [/^로그인$/])
        || await BrowserAutomationUtil.submitForm(page, ['a.mem_btn_join', '.mem_btn_join.bg1', 'button[type="submit"]'], this.logger, 'Catch');
      if (!clicked) {
        return { ok: false, finalUrl: page.url(), failedStep: '로그인 제출', error: '캐치 로그인 버튼을 찾을 수 없습니다.' };
      }

      await BrowserAutomationUtil.waitBrieflyForNavigation(page, 3_000);
      await page.waitForNetworkIdle({ idleTime: 700, timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});

      const ok = await this.isLoggedIn(page);
      const finalUrl = page.url();
      onLog?.(`캐치 로그인 최종 URL 확인: ${finalUrl}`);
      if (!ok) {
        const error = await this.getLoginError(page);
        onLog?.(`캐치 로그인 실패 메시지: ${error || 'ID/비밀번호 오류 또는 접근 차단'}`);
        return { ok: false, finalUrl, failedStep: '로그인 실패', error: error || 'ID/비밀번호 오류 또는 접근 차단' };
      }

      return { ok: true, finalUrl };
    } catch (err) {
      this.logger.warn(`[Catch] 로그인 오류: ${(err as Error).message}`);
      onLog?.(`캐치 로그인 중 예외 발생: ${(err as Error).message}`);
      return { ok: false, failedStep: '로그인', error: (err as Error).message };
    }
  }

  private async loginViaApi(
    page: Page,
    id: string,
    password: string,
    onLog?: BrowserLogFn,
  ): Promise<{ attempted: boolean; ok: boolean; finalUrl?: string; error?: string; failedStep?: string }> {
    try {
      onLog?.('캐치 API 로그인 시도: /member/auth/login');
      const apiResult = await page.evaluate(async ({ jobID, jobPwd }) => {
        const response = await fetch('/member/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json;charset=UTF-8',
          },
          body: JSON.stringify({
            jobID,
            jobPwd,
            regSite: '',
            snsID: '',
            catchID: '',
            memType: '1',
            jobID2: '',
            jobPwd2: '',
            snsName: '',
            snsEmail: '',
            snsGender: '',
            agreeEmail: false,
            agreeSMS: false,
            socialID: '',
            returnURL: '/',
            iframe: '',
            cel: '',
            code: '',
            catch_programID: null,
          }),
        });
        const data = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
        return {
          ok: response.ok && Boolean(data?.token),
          status: response.status,
          token: data?.token || '',
          refreshToken: data?.refreshToken || '',
          memID: data?.memID || '',
          regSite: data?.regSite || '',
          loginPoolPopup: data?.loginPoolPopup || '',
          redirect: data?.redirect || '',
          message: data?.message || data?.loginFailCode || '',
        };
      }, { jobID: id, jobPwd: password });

      onLog?.(`캐치 API 로그인 응답: HTTP ${apiResult.status}`);
      if (!apiResult.ok) {
        return {
          attempted: true,
          ok: false,
          failedStep: 'API 로그인',
          error: apiResult.message || `캐치 API 로그인 실패 (HTTP ${apiResult.status})`,
        };
      }

      const expires = Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000);
      await page.browserContext().setCookie(
        { name: 'token', value: apiResult.token, domain: '.catch.co.kr', path: '/', expires },
        { name: 'memID', value: String(apiResult.memID), domain: '.catch.co.kr', path: '/', expires },
        { name: 'loginPoolPopup', value: String(apiResult.loginPoolPopup ?? ''), domain: '.catch.co.kr', path: '/', expires },
        ...(apiResult.refreshToken
          ? [{ name: 'refreshToken', value: String(apiResult.refreshToken), domain: '.catch.co.kr', path: '/', expires: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000) }]
          : []),
      );

      const targetUrl = this.safeRedirectUrl(apiResult.redirect) ?? HOME_URL;
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
      const ok = await this.isLoggedIn(page);
      const finalUrl = page.url();
      onLog?.(`캐치 API 로그인 후 세션 확인 URL: ${finalUrl}`);
      return {
        attempted: true,
        ok,
        finalUrl,
        failedStep: ok ? undefined : 'API 로그인 세션 확인',
        error: ok ? undefined : '캐치 API 응답은 성공했지만 로그인 세션을 확인하지 못했습니다.',
      };
    } catch (err) {
      onLog?.(`캐치 API 로그인 예외: ${(err as Error).message}`);
      return { attempted: true, ok: false, failedStep: 'API 로그인', error: (err as Error).message };
    }
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    const cookies: Array<{ name: string; value: string }> = await page.browserContext().cookies().catch(() => []);
    if (cookies.some((cookie) => cookie.name === 'token' && cookie.value)) return true;

    return page.evaluate(() => {
      const text = document.body?.innerText ?? '';
      return /로그아웃|마이페이지|MY|지원현황/.test(text) && !/아이디 입력|비밀번호 입력/.test(text);
    }).catch(() => false);
  }

  private async getLoginError(page: Page): Promise<string> {
    return page.evaluate(() => {
      const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
      const match = text.match(/(로그인에 실패했습니다|아이디.*확인|비밀번호.*확인|계정.*잠김|휴대폰번호 인증[^.。]*)/);
      return match?.[0] ?? '';
    }).catch(() => '');
  }

  private safeRedirectUrl(redirect?: string): string | null {
    if (!redirect) return null;
    if (redirect.startsWith('/')) return `https://www.catch.co.kr${redirect}`;
    try {
      const url = new URL(redirect);
      return url.hostname.endsWith('catch.co.kr') ? url.toString() : null;
    } catch {
      return null;
    }
  }
}
