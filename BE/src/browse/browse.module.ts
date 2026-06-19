import { Module } from '@nestjs/common';
import { PuppeteerService } from 'src/browse/infrastructure/puppeteer.service';
import { CatchAuthService } from 'src/browse/infrastructure/auth/catch-auth.service';
import { JobplanetAuthService } from 'src/browse/infrastructure/auth/jobplanet-auth.service';
import { DdgSearchService } from 'src/browse/infrastructure/search/ddg-search.service';
import { IntelligentSearchService } from 'src/browse/infrastructure/search/intelligent-search.service';

@Module({
  providers: [
    PuppeteerService,
    CatchAuthService,
    JobplanetAuthService,
    DdgSearchService,
    IntelligentSearchService,
  ],
  exports: [
    PuppeteerService,
    CatchAuthService,
    JobplanetAuthService,
    DdgSearchService,
    IntelligentSearchService,
  ],
})
export class BrowseModule {}
1;
