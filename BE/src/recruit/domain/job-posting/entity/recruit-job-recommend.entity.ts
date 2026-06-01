import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recruit_job_recommend')
export class RecruitJobRecommendEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'job_posting_id', type: 'varchar' })
  jobPostingId!: string;

  @Column({ type: 'integer', default: 0 })
  score!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'match_points', type: 'text', nullable: true })
  matchPoints!: string | null;

  @Column({ name: 'recommended_at', type: 'varchar' })
  recommendedAt!: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
