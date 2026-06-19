import { Entity, Column, CreateDateColumn, PrimaryColumn } from 'typeorm';

@Entity('token_history')
export class TokenHistoryEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'ai_model' })
  aiModel: string;

  @Column({ name: 'used_tokens' })
  usedTokens: string;

  @Column({ name: 'estimated_fees', type: 'float' })
  estimatedFees: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
