import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SessionsModule } from '../sessions/sessions.module';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [SessionsModule, VectorModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
