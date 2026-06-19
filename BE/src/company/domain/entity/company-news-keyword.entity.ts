import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('company_news_keywords')
@Index(['companyId', 'rank'])
export class CompanyNewsKeywordEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @Column({ name: 'run_id', type: 'text' })
  runId!: string;

  @Column({ type: 'text' })
  keyword!: string;

  @Column({ type: 'text', nullable: true })
  category!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text' })
  model!: string;

  @Column({ name: 'source_title_count', type: 'integer', default: 0 })
  sourceTitleCount!: number;

  @Column({ type: 'integer', default: 0 })
  rank!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
