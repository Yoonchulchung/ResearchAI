import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VectorModule } from '../vector/vector.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [VectorModule, AiModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
