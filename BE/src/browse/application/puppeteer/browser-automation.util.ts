import type { Logger } from '@nestjs/common';
import type { Page } from 'puppeteer';

export type BrowserLogFn = (message: string) => void;

export interface PageDiagnostics {
  title: string;
  url: string;
  sample: string;
  inputs: string[];
}

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  `--user-agent=${BROWSER_USER_AGENT}`,
];

export const BROWSER_PROTOCOL_TIMEOUT_MS = 8_000;
export const INPUT_ACTION_TIMEOUT_MS = 3_000;
export const NAVIGATION_TIMEOUT_MS = 7_000;

export const BROWSER_LAUNCH_OPTIONS = {
  headless: true,
  args: BROWSER_ARGS,
  protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS,
} as const;

export class BrowserAutomationUtil {
  static async setupPage(page: Page): Promise<void> {
    page.setDefaultTimeout(INPUT_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  static async findVisibleSelector(
    page: Page,
    selectors: string[],
    timeout = 2_000,
  ): Promise<string | null> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        try {
          const el = await page.waitForSelector(selector, {
            visible: true,
            timeout: 250,
          });
          if (el) return selector;
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  static async setInputValue(
    page: Page,
    selector: string,
    value: string,
  ): Promise<boolean> {
    return this.withTimeout(
      page.evaluate(
        ({ sel, nextValue }) => {
          const input = document.querySelector<
            HTMLInputElement | HTMLTextAreaElement
          >(sel);
          if (!input) return false;

          input.focus();
          const proto = Object.getPrototypeOf(input) as HTMLInputElement;
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
          descriptor?.set?.call(input, nextValue);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return input.value === nextValue;
        },
        { sel: selector, nextValue: value },
      ),
      INPUT_ACTION_TIMEOUT_MS,
      `${selector} 값 설정 시간 초과`,
    );
  }

  static async fillInput(
    page: Page,
    selectors: string[],
    value: string,
    onLog?: BrowserLogFn,
    logger?: Logger,
    logPrefix = 'Browser',
  ): Promise<boolean> {
    onLog?.(`입력 필드 후보 확인: ${selectors.join(' | ')}`);
    const sel = await this.findVisibleSelector(page, selectors);
    if (!sel) return false;

    onLog?.(`입력 대상 확정: ${sel}`);
    try {
      if (await this.setInputValue(page, sel, value)) {
        logger?.debug(`[${logPrefix}] 입력 완료: ${sel}`);
        onLog?.(`입력 완료: ${sel}`);
        return true;
      }
      onLog?.(`${sel} 직접 값 설정 실패 - 키보드 입력 fallback`);
    } catch (err) {
      onLog?.(`${sel} 직접 값 설정 실패 - ${(err as Error).message}`);
    }

    const el = await page.$(sel);
    if (!el) return false;
    try {
      await this.withTimeout(
        el.click({ clickCount: 3 }),
        INPUT_ACTION_TIMEOUT_MS,
        `${sel} 클릭 시간 초과`,
      );
      await this.withTimeout(
        el.type(value, { delay: 20 }),
        INPUT_ACTION_TIMEOUT_MS,
        `${sel} 입력 시간 초과`,
      );
      logger?.debug(`[${logPrefix}] 입력 완료: ${sel}`);
      onLog?.(`입력 완료: ${sel}`);
      return true;
    } catch (err) {
      onLog?.(`${sel} 키보드 입력 실패 - ${(err as Error).message}`);
      return false;
    }
  }

  static async hasVisibleSelector(
    page: Page,
    selectors: string[],
    timeout = 500,
  ): Promise<boolean> {
    return Boolean(await this.findVisibleSelector(page, selectors, timeout));
  }

  static async waitBrieflyForNavigation(
    page: Page,
    timeout = 1500,
  ): Promise<void> {
    await Promise.race([
      page
        .waitForNavigation({ waitUntil: 'networkidle2', timeout })
        .catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeout)),
    ]);
  }

  static async clickTextButton(
    page: Page,
    patterns: RegExp[],
  ): Promise<boolean> {
    const clicked = await page.evaluate(
      (sources) => {
        const regexes = sources.map((source) => new RegExp(source, 'i'));
        const candidates = Array.from(
          document.querySelectorAll('button, a, [role="button"]'),
        );
        const target = candidates.find((el) => {
          const text = ((el as HTMLElement).innerText || el.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
          return text && regexes.some((regex) => regex.test(text));
        });
        (target as HTMLElement | undefined)?.click();
        return Boolean(target);
      },
      patterns.map((pattern) => pattern.source),
    );

    if (clicked) await new Promise<void>((resolve) => setTimeout(resolve, 700));
    return clicked;
  }

  static async getPageDiagnostics(page: Page): Promise<PageDiagnostics> {
    const title = await page.title().catch(() => '');
    const url = page.url();
    const { sample, inputs } = await page
      .evaluate(() => ({
        sample: (document.body?.innerText ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500),
        inputs: Array.from(document.querySelectorAll('input'))
          .map((input) => {
            const el = input;
            return [
              el.type ? `type=${el.type}` : '',
              el.name ? `name=${el.name}` : '',
              el.id ? `id=${el.id}` : '',
              el.placeholder ? `placeholder=${el.placeholder}` : '',
              el.autocomplete ? `autocomplete=${el.autocomplete}` : '',
            ]
              .filter(Boolean)
              .join(' ');
          })
          .slice(0, 10),
      }))
      .catch(() => ({ sample: '', inputs: [] }));
    return { title, url, sample, inputs };
  }

  static isBlockedPage(diagnostics: {
    title: string;
    sample: string;
  }): boolean {
    const text = `${diagnostics.title}\n${diagnostics.sample}`.toLowerCase();
    return (
      text.includes('cloudflare') ||
      text.includes('attention required') ||
      text.includes('sorry, you have been blocked') ||
      text.includes('access denied')
    );
  }

  static async submitForm(
    page: Page,
    selectors: string[],
    logger?: Logger,
    logPrefix = 'Browser',
  ): Promise<boolean> {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        await this.withTimeout(
          el.click(),
          INPUT_ACTION_TIMEOUT_MS,
          `${sel} 클릭 시간 초과`,
        );
        logger?.debug(`[${logPrefix}] 제출: ${sel}`);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }
}
