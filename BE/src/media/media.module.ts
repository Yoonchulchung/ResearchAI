import { Module } from '@nestjs/common';
import { MediaController } from 'src/media/media.controller';
import { MediaService } from 'src/media/media.service';
import { VectorModule } from 'src/vector/vector.module';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [VectorModule, AiModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
