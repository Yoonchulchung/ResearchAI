import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigEntity } from 'src/config/domain/entity/app-config.entity';
import { AppConfigRepository } from 'src/config/domain/repository/app-config.repository';
import { AppConfigService } from 'src/config/application/app-config.service';
import { AppConfigController } from 'src/config/presentation/app-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppConfigEntity])],
  controllers: [AppConfigController],
  providers: [AppConfigRepository, AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
