import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyAnalysisEntity } from 'src/company/domain/entity/company-analysis.entity';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';

@Entity('companies')
export class CompanyEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'normalized_name', type: 'text', unique: true })
  normalizedName!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'company_type', type: 'text', nullable: true })
  companyType!: string | null;

  @Column({ type: 'text', nullable: true })
  source!: string | null;

  @Column({ type: 'text', nullable: true })
  sources!: string | null;

  @Column({ type: 'text', nullable: true })
  evidence!: string | null;

  @Column({ name: 'corp_code', type: 'text', nullable: true })
  corpCode!: string | null;

  @Column({ type: 'text', nullable: true })
  employees!: string | null;

  @Column({ name: 'home_url', type: 'text', nullable: true })
  homeUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'ceo_name', type: 'text', nullable: true })
  ceoName!: string | null;

  @Column({ name: 'founded_date', type: 'text', nullable: true })
  foundedDate!: string | null;

  @Column({ type: 'text', nullable: true })
  industry!: string | null;

  @Column({ name: 'dart_url', type: 'text', nullable: true })
  dartUrl!: string | null;

  @Column({ name: 'refresh_skipped_at', type: 'datetime', nullable: true })
  refreshSkippedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToOne(() => CompanyAnalysisEntity, (a) => a.company)
  analysis?: CompanyAnalysisEntity;

  @OneToOne(() => CompanyFinancialEntity, (f) => f.company)
  financial?: CompanyFinancialEntity;
}
