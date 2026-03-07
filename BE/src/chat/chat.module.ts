import { Module } from '@nestjs/common';
import { ChatController } from './presentation/chat.controller';
import { ChatService } from './application/chat.service';
import { ChatHistoryService } from './application/chat-history.service';
import { SessionsModule } from '../sessions/sessions.module';
import { VectorModule } from '../vector/vector.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [SessionsModule, VectorModule, AiModule],
  controllers: [ChatController],
  providers: [ChatService, ChatHistoryService],
})
export class ChatModule {}
