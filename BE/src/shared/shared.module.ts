import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowseModule } from 'src/browse/browse.module';
import { SystemSettingEntity } from 'src/shared/entity/system-setting.entity';
import { SystemSettingsService } from 'src/shared/application/system-settings.service';

@Module({
  imports: [BrowseModule, TypeOrmModule.forFeature([SystemSettingEntity])],
  providers: [SystemSettingsService],
  exports: [BrowseModule, SystemSettingsService],
})
export class SharedModule {}
