import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { SessionEntity } from 'src/sessions/domain/entity/session.entity';

@Entity('session_job')
export class SessionJobEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: SessionEntity;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  company: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  skills: string | null;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'text', nullable: true })
  source: string | null;

  @Column({ name: 'posted_at', type: 'text', nullable: true })
  postedAt: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
