import { Module } from '@nestjs/common';
import { DocParseController } from './doc-parse.controller';
import { DocParseService } from './doc-parse.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DocParseController],
  providers: [DocParseService],
})
export class DocParseModule {}
