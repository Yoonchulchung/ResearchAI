import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { SessionItemEntity } from './session-item.enityt';

export enum ResearchState {
  IDLE = 'idle',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
}

@Entity('session')
export class SessionEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  topic: string;

  @Column({ name: 'research_ai_model' })
  researchAiModel: string;

  @Column({ name: 'research_web_model' })
  researchWebModel: string;

  @Column({ name: 'research_state', type: 'simple-enum', enum: ResearchState, default: ResearchState.IDLE })
  researchState: ResearchState;

  @OneToMany(() => SessionItemEntity, (item) => item.session)
  items: SessionItemEntity[];

  @Column({ name: 'summary', nullable: true })
  summary: string;

  @CreateDateColumn()
  created_at: Date;
}
