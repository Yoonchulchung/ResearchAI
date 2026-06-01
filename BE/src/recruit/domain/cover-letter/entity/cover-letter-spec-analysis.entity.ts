import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('recruit_cover_letter_spec_analyses')
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

  @Column({ name: 'extracted_spec', type: 'text', nullable: true })
  extractedSpec: string | null;

  // individual spec columns
  @Column({ type: 'varchar', nullable: true })
  school!: string | null;

  @Column({ type: 'varchar', nullable: true })
  major!: string | null;

  @Column({ type: 'varchar', nullable: true })
  gpa!: string | null;

  @Column({ type: 'text', nullable: true })
  languages!: string | null;

  @Column({ type: 'text', nullable: true })
  certificates!: string | null;

  @Column({ type: 'text', nullable: true })
  internships!: string | null;

  @Column({ type: 'text', nullable: true })
  activities!: string | null;

  @Column({ type: 'text', nullable: true })
  awards!: string | null;

  @Column({ type: 'text', nullable: true })
  skills!: string | null;

  @Column({ name: 'spec_summary', type: 'text', nullable: true })
  specSummary!: string | null;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ name: 'analyzed_at', type: 'datetime' })
  @UpdateDateColumn({ name: 'analyzed_at' })
  analyzedAt: Date;
}
