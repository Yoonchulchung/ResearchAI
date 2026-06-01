import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('recruit_cover_letters')
@Index(['source'])
@Index(['companyType'])
@Index(['jobCategory'])
@Index(['company'])
@Index(['position'])
@Index(['collectedAt'])
export class CoverLetterEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  source: string | null;

  @Column({ name: 'company_type', type: 'text', nullable: true })
  companyType: string | null;

  @Column({ name: 'job_category', type: 'text', nullable: true })
  jobCategory: string | null;

  @Column({ type: 'text' })
  company: string;

  @Column({ type: 'text' })
  position: string;

  @Column({ type: 'text' })
  season: string;

  @Column({ type: 'text' })
  spec: string;

  @Column({ name: 'view_count', type: 'integer', nullable: true })
  viewCount: number | null;

  @Column({ type: 'text' })
  questions: string;

  @Column({ name: 'search_text', type: 'text', nullable: true })
  searchText: string | null;

  @Column({ name: 'collected_at', type: 'datetime' })
  collectedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
