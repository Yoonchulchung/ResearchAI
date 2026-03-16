import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { AppConfigService } from '../application/app-config.service';

@Controller('config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get()
  getAll() {
    return this.appConfigService.getAll();
  }

  @Patch(':key')
  set(@Param('key') key: string, @Body() body: { value: string }) {
    return this.appConfigService.set(key, body.value).then(() => ({ key, value: body.value }));
  }
}
