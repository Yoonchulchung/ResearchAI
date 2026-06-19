import { Module } from '@nestjs/common';
import { BackgroundsController } from 'src/backgrounds/backgrounds.controller';
import { BackgroundsService } from 'src/backgrounds/backgrounds.service';

@Module({
  controllers: [BackgroundsController],
  providers: [BackgroundsService],
})
export class BackgroundsModule {}
