import { Module } from '@nestjs/common';
import { AiClientService } from './application/ai-client.service';
import { ModelsService } from './application/models.service';

@Module({
  providers: [AiClientService, ModelsService],
  exports: [AiClientService, ModelsService],
})
export class AiModule {}
