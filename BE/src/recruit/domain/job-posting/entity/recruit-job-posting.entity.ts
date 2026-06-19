import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('recruit_job_posting')
export class RecruitJobPostingEntity {
  @PrimaryColumn()
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  @Column({ name: 'source_type', type: 'varchar', nullable: true })
  sourceType!: string | null;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'varchar' })
  company!: string;

  @Column({ name: 'company_type', type: 'varchar', nullable: true })
  companyType!: string | null;

  @Column({ type: 'varchar', nullable: true })
  type!: string | null;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ name: 'start_date', type: 'varchar', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date', type: 'varchar', nullable: true })
  endDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  deadline!: string | null;

  @Column({ type: 'text', nullable: true })
  jobs!: string | null;

  @Column({ type: 'varchar', nullable: true })
  homepage!: string | null;

  @Column({ name: 'view_count', type: 'integer', nullable: true })
  viewCount!: number | null;

  @Column({ name: 'detail_content', type: 'text', nullable: true })
  detailContent!: string | null;

  @Column({ name: 'detail_html', type: 'text', nullable: true })
  detailHtml!: string | null;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'boolean', default: false })
  favorite!: boolean;

  @Column({ name: 'applied_at', type: 'varchar', nullable: true })
  appliedAt!: string | null;

  @Column({ name: 'collected_at', type: 'varchar' })
  collectedAt!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
