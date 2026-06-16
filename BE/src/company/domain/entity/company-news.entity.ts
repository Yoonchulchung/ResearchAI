import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('company_news')
@Index(['companyId', 'url'], { unique: true }) // 동일 기업+URL 중복 방지
export class CompanyNewsEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'text', nullable: true })
  snippet!: string | null;

  @Column({ type: 'text', nullable: true })
  source!: string | null;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
