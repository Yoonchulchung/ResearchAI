import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { SessionItemEntity } from './session-item.enityt';

export enum ResearchState {
  IDLE = 'idle',
  PENDING = 'pending',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
  STOPPED = 'stopped',
  ABORTED = 'aborted',
}

export enum SummaryState {
  IDLE = 'idle',
  PENDING = 'pending',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
  STOPPED = 'stopped',
  ABORTED = 'aborted',
}

@Entity('session')
export class SessionEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  topic: string;

  @Column({ name: 'research_cloud_ai_model' })
  researchCloudAIModel: string;

  @Column({ name: 'research_local_ai_model' })
  researchLocalAIModel: string;

  @Column({ name: 'research_web_model' })
  researchWebModel: string;

  // 최종 세션의 리서치 상태
  @Column({ name: 'research_state', type: 'simple-enum', enum: ResearchState, default: ResearchState.IDLE })
  researchState: ResearchState;

  @OneToMany(() => SessionItemEntity, (item) => item.session)
  items: SessionItemEntity[];

  @Column({ name: 'summary', nullable: true })
  summary: string;

  @Column({ name: 'summary_state', default: SummaryState.IDLE })
  summaryState: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
