import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { SessionItemEntity } from 'src/sessions/domain/entity/session-item.entity';
import { UserEntity } from 'src/auth/domain/entity/user.entity';

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
  CHANGED = 'changed',
}

@Entity('session')
export class SessionEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column()
  topic: string;

  @Column({ name: 'research_cloud_ai_model' })
  researchCloudAIModel: string;

  @Column({ name: 'research_local_ai_model' })
  researchLocalAIModel: string;

  @Column({ name: 'research_web_model' })
  researchWebModel: string;

  // 최종 세션의 리서치 상태
  @Column({
    name: 'research_state',
    type: 'simple-enum',
    enum: ResearchState,
    default: ResearchState.IDLE,
  })
  researchState: ResearchState;

  @OneToMany(() => SessionItemEntity, (item) => item.session)
  items: SessionItemEntity[];

  @Column({
    name: 'attached_file_ids',
    type: 'simple-json',
    nullable: true,
    default: null,
  })
  attachedFileIds: string[] | null;

  @Column({ name: 'summary', nullable: true })
  summary: string;

  @Column({ name: 'summary_state', default: SummaryState.IDLE })
  summaryState: string;

  @Column({
    name: 'session_type',
    type: 'text',
    nullable: true,
    default: 'research',
  })
  sessionType: string;

  @Column({ name: 'light_research_id', type: 'text', nullable: true })
  lightResearchId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
