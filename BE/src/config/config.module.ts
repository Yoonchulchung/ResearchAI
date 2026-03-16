import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigEntity } from './domain/entity/app-config.entity';
import { AppConfigRepository } from './domain/repository/app-config.repository';
import { AppConfigService } from './application/app-config.service';
import { AppConfigController } from './presentation/app-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppConfigEntity])],
  controllers: [AppConfigController],
  providers: [AppConfigRepository, AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
