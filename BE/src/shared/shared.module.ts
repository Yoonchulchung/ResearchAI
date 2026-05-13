import { Module } from '@nestjs/common';
import { CatchAuthService } from './infrastructure/auth/catch-auth.service';
import { JobplanetAuthService } from './infrastructure/auth/jobplanet-auth.service';
import { PuppeteerService } from './infrastructure/browser/puppeteer.service';

@Module({
  providers: [CatchAuthService, JobplanetAuthService, PuppeteerService],
  exports: [CatchAuthService, JobplanetAuthService, PuppeteerService],
})
export class SharedModule {}
