import { Module } from '@nestjs/common';
import { ChatController } from './presentation/chat.controller';
import { ChatService } from './application/chat.service';
import { ChatHistoryService } from './application/chat-history.service';
import { ContextCompactorService } from './application/context-compactor.service';
import { SessionsModule } from '../sessions/sessions.module';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [SessionsModule, VectorModule],
  controllers: [ChatController],
  providers: [ChatService, ChatHistoryService, ContextCompactorService],
})
export class ChatModule {}
