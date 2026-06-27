import { Module } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import { BROWSER_AUTOMATION_PORT } from 'src/browse/application/ports/browser-automation.port';
import { PuppeteerBrowserEngine } from 'src/browse/application/puppeteer/puppeteer-browser.engine';
import { PuppeteerBrowserPort } from 'src/browse/application/puppeteer/puppeteer-browser.port';
import { BrowserAutomationAdapter } from 'src/browse/infrastructure/browser-automation.adapter';
import { BrowserNewsService } from 'src/browse/infrastructure/news/browser-news.service';
import { CatchAuthService } from 'src/browse/infrastructure/auth/catch-auth.service';
import { JobplanetAuthService } from 'src/browse/infrastructure/auth/jobplanet-auth.service';
import { DdgSearchService } from 'src/browse/infrastructure/search/ddg-search.service';
import { GoogleSearchService } from 'src/browse/infrastructure/search/google-search.service';
import { NaverNewsSearchService } from 'src/browse/infrastructure/search/naver-news-search.service';
import { SerperSearchService } from 'src/browse/infrastructure/search/serper-search.service';
import { IntelligentSearchService } from 'src/browse/infrastructure/search/intelligent-search.service';

@Module({
  providers: [
    BrowserService,
    PuppeteerBrowserEngine,
    BrowserAutomationAdapter,
    BrowserNewsService,
    {
      provide: PuppeteerBrowserPort,
      useExisting: PuppeteerBrowserEngine,
    },
    /**
     * 브라우저 엔진 선택 지점.
     * Playwright/Selenium 어댑터를 추가하면 useExisting 대상만 교체한다.
     */
    {
      provide: BROWSER_AUTOMATION_PORT,
      useExisting: BrowserAutomationAdapter,
    },
    CatchAuthService,
    JobplanetAuthService,
    DdgSearchService,
    GoogleSearchService,
    NaverNewsSearchService,
    SerperSearchService,
    IntelligentSearchService,
  ],
  exports: [
    BrowserService,
    CatchAuthService,
    JobplanetAuthService,
    DdgSearchService,
    GoogleSearchService,
    NaverNewsSearchService,
    SerperSearchService,
    IntelligentSearchService,
  ],
})
export class BrowseModule {}
