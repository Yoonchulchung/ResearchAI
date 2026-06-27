import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from 'src/chat/presentation/chat.controller';
import { ChatService } from 'src/chat/application/chat.service';
import { ChatStreamImplService } from 'src/chat/application/stream/chat-stream-impl.service';
import { ChatRepository } from 'src/chat/domain/repository/chat.repository';
import { ChatEntity } from 'src/chat/domain/entity/chat.entity';
import { SessionsModule } from 'src/sessions/sessions.module';
import { AiModule } from 'src/ai/ai.module';
import { VectorModule } from 'src/vector/vector.module';
import { ResearchModule } from 'src/research/research.module';
import { CompanyModule } from 'src/company/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatEntity]),
    SessionsModule,
    AiModule,
    VectorModule,
    ResearchModule,
    forwardRef(() => CompanyModule),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatStreamImplService, ChatRepository],
})
export class ChatModule {}
