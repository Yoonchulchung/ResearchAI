import { Entity, Column, CreateDateColumn, PrimaryColumn } from 'typeorm';

@Entity('ai_call_log')
export class AiCallLogEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId: string | null;

  @Column({ name: 'ai_model' })
  aiModel: string;

  @Column({ name: 'caller', type: 'text', nullable: true })
  caller: string | null;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ name: 'user_prompt', type: 'text', nullable: true })
  userPrompt: string | null;

  @Column({ name: 'response', type: 'text', nullable: true })
  response: string | null;

  @Column({ name: 'input_tokens', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', default: 0 })
  outputTokens: number;

  @Column({ name: 'estimated_fees', type: 'float', default: 0 })
  estimatedFees: number;

  @Column({ name: 'duration_ms', default: 0 })
  durationMs: number;

  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
