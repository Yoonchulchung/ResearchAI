import { SessionEntity } from 'src/sessions/domain/entity/session.entity';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

export enum WhoSent {
  AI = 'ai',
  USER = 'user',
}

@Entity('chat')
export class ChatEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => SessionEntity, (session) => session.items)
  @JoinColumn({ name: 'session_id' })
  session: SessionEntity;

  @Column({name: 'who_sent'})
  whoSent: string;

  @Column()
  message: string;

  /** AI 컨텍스트용 메시지 (검색 결과 등 포함). null이면 message를 그대로 사용 */
  @Column({ name: 'context_message', nullable: true, type: 'text' })
  contextMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}
