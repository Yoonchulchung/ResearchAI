import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

@Entity('company_financial')
export class CompanyFinancialEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text', unique: true })
  companyId!: string;

  @OneToOne(() => CompanyEntity, (c) => c.financial, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: CompanyEntity;

  @Column({ name: 'stock_code', type: 'text', nullable: true })
  stockCode!: string | null;

  @Column({ name: 'corp_class', type: 'text', nullable: true })
  corpClass!: string | null;

  @Column({ type: 'text', nullable: true })
  capital!: string | null;

  @Column({ type: 'text', nullable: true })
  revenue!: string | null;

  @Column({ name: 'financial_summary', type: 'text', nullable: true })
  financialSummary!: string | null;

  @Column({ name: 'multi_year_financials', type: 'text', nullable: true })
  multiYearFinancials!: string | null;

  @Column({ type: 'text', nullable: true })
  disclosures!: string | null;

  @Column({ name: 'employee_detail', type: 'text', nullable: true })
  employeeDetail!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
