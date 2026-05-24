import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './presentation/chat.controller';
import { ChatService } from './application/chat.service';
import { ChatRepository } from './domain/repository/chat.repository';
import { ChatEntity } from './domain/entity/chat.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { AiModule } from '../ai/ai.module';
import { VectorModule } from '../vector/vector.module';
import { ResearchModule } from '../research/research.module';
import { CompanyAnalysisModule } from '../company-analysis/company-analysis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatEntity]),
    SessionsModule,
    AiModule,
    VectorModule,
    ResearchModule,
    forwardRef(() => CompanyAnalysisModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
})
export class ChatModule {}
