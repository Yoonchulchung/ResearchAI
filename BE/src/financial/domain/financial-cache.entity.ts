import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('financial_cache')
export class FinancialCacheEntity {
  @PrimaryColumn({ length: 200 })
  key: string;

  @Column('text')
  value: string;

  @Column('bigint')
  expiresAt: number;
}
