import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryColumn,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from 'src/sessions/domain/entity/session.entity';

export enum ResearchState {
  IDLE = 'idle',
  PENDING = 'pending',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
  STOPPED = 'stopped',
  ABORTED = 'aborted',
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

  // Web 서칭 프롬프트 -> 웹 결과 -> aiPrompt 순으로 작성되어야 함.
  @Column({ name: 'web_prompt' })
  webPrompt: string;

  @Column({ name: 'web_result', nullable: true })
  webResult: string;

  @Column({ name: 'ai_prompt', nullable: true })
  aiPrompt: string;

  @Column({ name: 'ai_result', nullable: true })
  aiResult: string;

  @Column({ name: 'confidence_score', type: 'int', nullable: true })
  confidenceScore: number | null;

  @Column({ name: 'confidence_reason', type: 'text', nullable: true })
  confidenceReason: string | null;

  @Column({ name: 'input_tokens', type: 'int', nullable: true })
  inputTokens: number | null;

  @Column({ name: 'output_tokens', type: 'int', nullable: true })
  outputTokens: number | null;

  @Column({ name: 'estimated_fees', type: 'float', nullable: true })
  estimatedFees: number | null;

  @Column({ name: 'used_web_model', type: 'text', nullable: true })
  usedWebModel: string | null;

  @Column({ name: 'search_log', type: 'text', nullable: true })
  searchLog: string | null; // JSON string: { query, result }[]

  @Column({ name: 'chart_data', type: 'text', nullable: true })
  chartData: string | null; // JSON string: ChartData[]

  @Column({
    name: 'research_state',
    type: 'simple-enum',
    enum: ResearchState,
    default: ResearchState.IDLE,
  })
  researchState: ResearchState;

  @CreateDateColumn()
  created_at: Date;
}
