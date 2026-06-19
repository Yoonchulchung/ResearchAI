import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';

@Entity('company_investor_trading')
@Index(['companyId'], { unique: true })
export class CompanyInvestorTradingEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: CompanyEntity;

  @Column({ name: 'stock_code', type: 'text', nullable: true })
  stockCode!: string | null;

  @Column({ type: 'text' })
  source!: string;

  @Column({ type: 'text' })
  records!: string;

  @Column({ type: 'integer', default: 0 })
  days!: number;

  @Column({ name: 'fetched_date', type: 'text' })
  fetchedDate!: string;

  @Column({ name: 'fetched_at', type: 'datetime' })
  fetchedAt!: Date;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
