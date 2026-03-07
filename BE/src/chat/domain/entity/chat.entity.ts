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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}
