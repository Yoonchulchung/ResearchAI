import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('company_financial_ai_analysis')
export class CompanyFinancialAiAnalysisEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @Column({ type: 'text' })
  model!: string;

  /** JSON-serialised CompanyFinancialAiAnalysis (overview, strengths, …) */
  @Column({ type: 'text' })
  result!: string;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens!: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens!: number | null;

  @Column({ name: 'estimated_fees', type: 'real', nullable: true })
  estimatedFees!: number | null;

  @Column({ name: 'analyzed_at', type: 'text', nullable: true })
  analyzedAt!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
