import { Module } from '@nestjs/common';
import { PuppeteerService } from './infrastructure/puppeteer.service';
import { CatchAuthService } from './infrastructure/auth/catch-auth.service';
import { JobplanetAuthService } from './infrastructure/auth/jobplanet-auth.service';
import { DdgSearchService } from './infrastructure/search/ddg-search.service';
import { IntelligentSearchService } from './infrastructure/search/intelligent-search.service';

@Module({
  providers: [PuppeteerService, CatchAuthService, JobplanetAuthService, DdgSearchService, IntelligentSearchService],
  exports: [PuppeteerService, CatchAuthService, JobplanetAuthService, DdgSearchService, IntelligentSearchService],
})
export class BrowseModule {}
1