import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatEntity, WhoSent } from '../entity/chat.entity';

@Injectable()
export class ChatRepository {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly repo: Repository<ChatEntity>,
  ) {}

  async findBySessionId(sessionId: string): Promise<ChatEntity[]> {
    return this.repo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async save(chat: { id: string; sessionId: string; whoSent: WhoSent; message: string }): Promise<ChatEntity> {
    return this.repo.save(chat);
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.repo.delete({ sessionId });
  }
}
