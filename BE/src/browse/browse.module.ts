import { Module } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import { BROWSER_AUTOMATION_PORT } from 'src/browse/application/ports/browser-automation.port';
import { PuppeteerBrowserAdapter } from 'src/browse/infrastructure/puppeteer-browser.adapter';
import { CatchAuthService } from 'src/browse/infrastructure/auth/catch-auth.service';
import { JobplanetAuthService } from 'src/browse/infrastructure/auth/jobplanet-auth.service';
import { DdgSearchService } from 'src/browse/infrastructure/search/ddg-search.service';
import { IntelligentSearchService } from 'src/browse/infrastructure/search/intelligent-search.service';

@Module({
  providers: [
    BrowserService,
    PuppeteerBrowserAdapter,
    /**
     * 브라우저 엔진 선택 지점.
     * Playwright/Selenium 어댑터를 추가하면 useExisting 대상만 교체한다.
     */
    {
      provide: BROWSER_AUTOMATION_PORT,
      useExisting: PuppeteerBrowserAdapter,
    },
    CatchAuthService,
    JobplanetAuthService,
    DdgSearchService,
    IntelligentSearchService,
  ],
  exports: [
    BrowserService,
    CatchAuthService,
    JobplanetAuthService,
    DdgSearchService,
    IntelligentSearchService,
  ],
})
export class BrowseModule {}
