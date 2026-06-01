import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('company_rate')
export class CompanyRateEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'company_key', type: 'text', unique: true })
  companyKey: string;

  @Column({ name: 'company_name', type: 'text' })
  companyName: string;

  @Column({ type: 'text', default: 'jobplanet' })
  source: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'overall_rating', type: 'real', nullable: true })
  overallRating: number | null;

  @Column({ name: 'review_count', type: 'integer', nullable: true })
  reviewCount: number | null;

  @Column({ type: 'text', nullable: true })
  welfare: string | null;

  @Column({ name: 'culture_rating', type: 'text', nullable: true })
  cultureRating: string | null;

  @Column({ name: 'wlb_rating', type: 'text', nullable: true })
  wlbRating: string | null;

  @Column({ type: 'text', nullable: true })
  reviews: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
