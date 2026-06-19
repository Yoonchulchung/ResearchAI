import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('news_papers_trend_summary')
@Index(['generatedAt'])
@Index(['expiresAt'])
export class PaperTrendSummaryEntity {
  @PrimaryColumn({ name: 'cache_key', type: 'text' })
  cacheKey: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'keywords_json', type: 'text', default: '[]' })
  keywordsJson: string;

  @Column({ name: 'paper_count', type: 'integer', default: 0 })
  paperCount: number;

  @Column({ name: 'source_count', type: 'integer', default: 0 })
  sourceCount: number;

  @Column({ type: 'text' })
  model: string;

  @Column({ name: 'generated_at', type: 'text' })
  generatedAt: string;

  @Column({ name: 'expires_at', type: 'text' })
  expiresAt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
