import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowseModule } from '../browse/browse.module';
import { SystemSettingEntity } from './entity/system-setting.entity';
import { SystemSettingsService } from './application/system-settings.service';

@Module({
  imports: [BrowseModule, TypeOrmModule.forFeature([SystemSettingEntity])],
  providers: [SystemSettingsService],
  exports: [BrowseModule, SystemSettingsService],
})
export class SharedModule {}
