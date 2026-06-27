import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('stock_cache')
export class StockCacheEntity {
  @PrimaryColumn({ length: 200 })
  key: string;

  @Column('text')
  value: string;

  /** Unix ms — 이 시각 이후엔 stale로 간주 */
  @Column('bigint')
  expiresAt: number;
}
