import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import { SessionEntity } from './session.entity';

export enum ResearchState {
  IDLE = 'idle',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
}

@Entity('session_item')
export class SessionItemEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, (session) => session.items)
  @JoinColumn({ name: 'session_id' })
  session: SessionEntity;

  @Column()
  topic: string;

  @Column({ name: 'task_icon', nullable: true })
  taskIcon: string;

  // Web 서칭 프롬프트 -> 웹 결과 -> aiPrompt 순으로 작성되어야 함.
  @Column({ name: 'web_prompt'})
  webPrompt: string;

  @Column({ name: 'web_result', nullable: true })
  webResult: string;

  @Column({ name: 'ai_prompt', nullable: true })
  aiPrompt: string;

  @Column({ name: 'ai_result', nullable: true })
  aiResult: string;

  @Column({ name: 'research_state', type: 'simple-enum', enum: ResearchState, default: ResearchState.IDLE })
  researchState: ResearchState;

  @CreateDateColumn()
  created_at: Date;
}
