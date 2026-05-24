import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('cover_letter_spec_analyses')
@Index(['jobCategory'])
@Index(['analyzedAt'])
export class CoverLetterSpecAnalysisEntity {
  @PrimaryColumn({ name: 'cover_letter_id', type: 'text' })
  coverLetterId: string;

  @Column({ name: 'job_category', type: 'text' })
  jobCategory: string;

  @Column({ type: 'real', default: 0 })
  confidence: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'extracted_spec', type: 'text' })
  extractedSpec: string;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ name: 'analyzed_at', type: 'datetime' })
  @UpdateDateColumn({ name: 'analyzed_at' })
  analyzedAt: Date;
}
